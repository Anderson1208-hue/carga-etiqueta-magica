import { useEffect, useRef, useState, useCallback } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { enqueue, pendingCount } from "@/lib/gpsQueue";
import { markEnqueue, markError, markWatcherStart } from "@/lib/gpsTelemetry";

/**
 * Hook nativo para rastreamento GPS em segundo plano via Capacitor.
 *
 * Estratégia profissional (Fase 1):
 * - Watcher do plugin emite posições -> entram NA FILA (IndexedDB) primeiro.
 * - O envio ao backend é feito por `useGpsQueueWorker` em outro lugar
 *   (drena a fila com retry exponencial + dedup).
 * - Heartbeat: a cada 60s envia a última posição com flag `heartbeat=true`
 *   para a Torre saber que o motorista está vivo mesmo parado.
 * - Auto-restart: se o watcher morrer (sem callback há > 3 min), tentamos
 *   reiniciar.
 *
 * Mantém a mesma interface pública anterior.
 */

interface GpsConfig {
  intervalo_padrao_segundos: number;
  intervalo_critico_segundos: number;
  distance_filter_metros: number;
  batch_sync_ativo: boolean;
  batch_max_posicoes: number;
  raio_aproximacao_metros: number;
}

const DEFAULT_CONFIG: GpsConfig = {
  intervalo_padrao_segundos: 120,
  intervalo_critico_segundos: 60,
  distance_filter_metros: 100,
  batch_sync_ativo: true,
  batch_max_posicoes: 5,
  raio_aproximacao_metros: 500,
};

// Força envio de posição ao backend a cada 20s, independente de movimento.
// Cobre cenários em que o motorista está parado ou o watcher do plugin
// está em modo de baixa frequência — garante uma posição na Torre a cada 20s.
const HEARTBEAT_MS = 20_000;
const FORCED_PING_MS = 20_000;
const WATCHER_STALE_MS = 3 * 60_000; // se não vier callback em 3 min, reinicia

interface UseGpsTrackerOptions {
  monitoramentoRotaId: string | null;
  enabled: boolean;
  paradasCoords?: { lat: number; lng: number }[];
  config?: Partial<GpsConfig>;
}

interface BgWatcherOptions {
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
  stale?: boolean;
  distanceFilter?: number;
}
interface BgLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  time: number | null;
}
interface BackgroundGeolocationPlugin {
  addWatcher(
    options: BgWatcherOptions,
    callback: (location: BgLocation | null, error?: { code: string; message: string }) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGpsTrackerNative({
  monitoramentoRotaId,
  enabled,
  paradasCoords = [],
  config: configOverride,
}: UseGpsTrackerOptions) {
  const cfg: GpsConfig = { ...DEFAULT_CONFIG, ...configOverride };

  const watcherIdRef = useRef<string | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const lastCallbackAtRef = useRef<number>(Date.now());
  const restartingRef = useRef<boolean>(false);

  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modoCritico, setModoCritico] = useState(false);
  const [pendingQueue, setPendingQueue] = useState(0);

  const checkModoCritico = useCallback(
    (lat: number, lng: number): boolean => {
      if (paradasCoords.length === 0) return false;
      return paradasCoords.some(
        (p) => haversine(lat, lng, p.lat, p.lng) <= cfg.raio_aproximacao_metros
      );
    },
    [paradasCoords, cfg.raio_aproximacao_metros]
  );

  // Inicialização do watcher + heartbeat + supervisor de auto-restart
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return; // web é tratado por outro hook

    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let supervisorTimer: ReturnType<typeof setInterval> | null = null;
    let foregroundFallbackTimer: ReturnType<typeof setInterval> | null = null;

    async function enqueueForegroundFallback(reason: string) {
      if (!enabled || !monitoramentoRotaId || !navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled || !monitoramentoRotaId) return;

          const { latitude, longitude, accuracy } = pos.coords;
          const last = lastSentRef.current;
          const movedEnough = !last || haversine(last.lat, last.lng, latitude, longitude) >= cfg.distance_filter_metros;

          lastPositionRef.current = { lat: latitude, lng: longitude, accuracy };
          setLastPosition({ lat: latitude, lng: longitude });
          if (movedEnough) lastSentRef.current = { lat: latitude, lng: longitude };

          try {
            await enqueue({
              monitoramento_rota_id: monitoramentoRotaId,
              latitude,
              longitude,
              accuracy,
              timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
              heartbeat: !movedEnough,
            });
            markEnqueue({ lat: latitude, lng: longitude, accuracy });
            setPendingQueue(await pendingCount());
            setError(null);
            console.info(`[GPS Native] fallback foreground enfileirou posição (${reason})`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[GPS Native] fallback enqueue falhou", err);
            markError(msg);
          }
        },
        (err) => {
          const msg = err.message || "GPS sem retorno no fallback foreground";
          console.warn("[GPS Native] fallback geolocation falhou", err);
          markError(msg);
          setError(msg);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    }

    async function startWatcher() {
      if (!enabled || !monitoramentoRotaId) return;
      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: "Rastreamento da rota ativo",
            backgroundTitle: "Carga Etiqueta Mágica",
            requestPermissions: true,
            stale: false,
            distanceFilter: cfg.distance_filter_metros,
          },
          async (location, errCb) => {
            lastCallbackAtRef.current = Date.now();
            if (errCb) {
              console.error("[GPS Native] erro watcher:", errCb);
              if (errCb.code === "NOT_AUTHORIZED") {
                setError("Permissão de localização negada. Abra as configurações.");
                BackgroundGeolocation.openSettings().catch(() => {});
              } else {
                setError(errCb.message || "Erro de GPS");
              }
              return;
            }
            if (!location || !monitoramentoRotaId) return;

            const { latitude, longitude, accuracy } = location;
            lastPositionRef.current = { lat: latitude, lng: longitude, accuracy };

            // distance filter defensivo
            if (lastSentRef.current) {
              const dist = haversine(
                lastSentRef.current.lat,
                lastSentRef.current.lng,
                latitude,
                longitude
              );
              if (dist < cfg.distance_filter_metros) {
                setLastPosition({ lat: latitude, lng: longitude });
                return;
              }
            }

            const critico = checkModoCritico(latitude, longitude);
            setModoCritico(critico);
            setLastPosition({ lat: latitude, lng: longitude });
            lastSentRef.current = { lat: latitude, lng: longitude };

            try {
              await enqueue({
                monitoramento_rota_id: monitoramentoRotaId,
                latitude,
                longitude,
                accuracy,
                timestamp: new Date(location.time ?? Date.now()).toISOString(),
                heartbeat: false,
              });
              markEnqueue({ lat: latitude, lng: longitude, accuracy });
              setError(null);
            } catch (err) {
              console.error("[GPS Native] enqueue err:", err);
              markError(err instanceof Error ? err.message : String(err));
            }
          }
        );

        if (cancelled) {
          await BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
          return;
        }
        watcherIdRef.current = id;
        setTracking(true);
        markWatcherStart();
        lastCallbackAtRef.current = Date.now();
      } catch (err) {
        console.error("[GPS Native] Falha ao iniciar:", err);
        setError("Não foi possível iniciar o rastreamento nativo");
      }
    }

    async function stopWatcher() {
      if (watcherIdRef.current) {
        try {
          await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
        } catch {
          /* ignore */
        }
        watcherIdRef.current = null;
      }
      setTracking(false);
      setModoCritico(false);
    }

    async function restartWatcher() {
      if (restartingRef.current) return;
      restartingRef.current = true;
      try {
        console.warn("[GPS Native] auto-restart do watcher");
        await stopWatcher();
        await startWatcher();
      } finally {
        restartingRef.current = false;
      }
    }

    if (enabled && monitoramentoRotaId) {
      startWatcher();

      // Fallback foreground: se o plugin nativo não emitir callback inicial,
      // usa a geolocalização do WebView para pelo menos registrar posição.
      setTimeout(() => {
        if (cancelled) return;
        const silent = Date.now() - lastCallbackAtRef.current;
        if (silent > 10_000) enqueueForegroundFallback("callback-inicial-ausente");
      }, 12_000);

      foregroundFallbackTimer = setInterval(() => {
        const silent = Date.now() - lastCallbackAtRef.current;
        if (silent > FORCED_PING_MS) {
          enqueueForegroundFallback("forced-ping-20s");
        }
      }, FORCED_PING_MS);

      // Heartbeat: a cada 60s, enfileira a última posição como heartbeat
      heartbeatTimer = setInterval(async () => {
        const last = lastPositionRef.current;
        if (!last || !monitoramentoRotaId) return;
        try {
          await enqueue({
            monitoramento_rota_id: monitoramentoRotaId,
            latitude: last.lat,
            longitude: last.lng,
            accuracy: last.accuracy,
            timestamp: new Date().toISOString(),
            heartbeat: true,
          });
          setPendingQueue(await pendingCount());
        } catch (err) {
          console.warn("[GPS Native] heartbeat enqueue falhou", err);
        }
      }, HEARTBEAT_MS);

      // Supervisor: se watcher ficou silencioso > WATCHER_STALE_MS, reinicia
      supervisorTimer = setInterval(() => {
        const silent = Date.now() - lastCallbackAtRef.current;
        if (silent > WATCHER_STALE_MS && watcherIdRef.current) {
          restartWatcher();
        }
      }, 30_000);
    } else {
      stopWatcher();
    }

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (supervisorTimer) clearInterval(supervisorTimer);
      if (foregroundFallbackTimer) clearInterval(foregroundFallbackTimer);
      stopWatcher();
    };
  }, [
    enabled,
    monitoramentoRotaId,
    cfg.distance_filter_metros,
    cfg.intervalo_padrao_segundos,
    checkModoCritico,
  ]);

  return { tracking, lastPosition, error, modoCritico, pendingQueue };
}
