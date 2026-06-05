import { useEffect, useRef, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import BackgroundGeolocation, {
  Location,
  MotionChangeEvent,
  ProviderChangeEvent,
  DesiredAccuracy,
  LogLevel,
  NotificationPriority,
} from "@transistorsoft/capacitor-background-geolocation";
import { enqueue, pendingCount } from "@/lib/gpsQueue";
import { markEnqueue, markError, markWatcherStart } from "@/lib/gpsTelemetry";

/**
 * Tracker GPS nativo usando @transistorsoft/capacitor-background-geolocation.
 *
 * Por que esse plugin (vs @capacitor-community/background-geolocation):
 * - Mantém GPS rodando com tela bloqueada, Doze Mode e fabricantes agressivos
 *   (Xiaomi/Huawei/Samsung/Motorola) — é o padrão de mercado para last-mile.
 * - Sobrevive a app encerrado pelo SO (stopOnTerminate=false, startOnBoot=true).
 * - Foreground Service nativo com notificação persistente já gerenciado pelo plugin.
 *
 * Estratégia (Fase 1 — debug, sem licença release):
 * - Posições do plugin → entram na fila (IndexedDB) → useGpsQueueWorker drena.
 * - Heartbeat a cada 30s (a própria Transistorsoft já faz heartbeat nativo,
 *   mas mantemos um heartbeat de aplicação para que a Torre veja "vivo" mesmo parado).
 * - Sem licença: builds debug funcionam plenamente; release exibe aviso
 *   ("BackgroundGeolocation is for evaluation purposes only") mas continua
 *   coletando — suficiente para validar tela bloqueada antes de comprar.
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
  distance_filter_metros: 50,
  batch_sync_ativo: true,
  batch_max_posicoes: 5,
  raio_aproximacao_metros: 500,
};

const HEARTBEAT_MS = 30_000;

interface UseGpsTrackerOptions {
  monitoramentoRotaId: string | null;
  enabled: boolean;
  paradasCoords?: { lat: number; lng: number }[];
  config?: Partial<GpsConfig>;
}

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

// Estado global do plugin: ele deve ser .ready() uma única vez por processo.
let pluginReady = false;
let readyPromise: Promise<void> | null = null;

async function ensurePluginReady(distanceFilter: number): Promise<void> {
  if (pluginReady) return;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await BackgroundGeolocation.ready({
      reset: true,
      geolocation: {
        desiredAccuracy: DesiredAccuracy.High,
        distanceFilter,
        stationaryRadius: 25,
        locationAuthorizationRequest: "Always",
      },
      app: {
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        notification: {
          title: "Orkestria Driver — Rastreamento ativo",
          text: "Sua rota está em andamento",
          sticky: true,
          priority: NotificationPriority.Default,
          smallIcon: "ic_stat_notify",
        },
        backgroundPermissionRationale: {
          title: "Permitir o tempo todo",
          message:
            'Para registrar sua rota mesmo com a tela bloqueada, marque "Permitir o tempo todo" nas configurações.',
          positiveAction: "Abrir Configurações",
          negativeAction: "Cancelar",
        },
      },
      // NÃO usamos o uploader HTTP do plugin — controlamos via fila IndexedDB
      // (dedup, retry exponencial e batching já existentes).
      http: {
        autoSync: false,
        batchSync: false,
      },
      logger: {
        debug: import.meta.env.VITE_BUILD_ENV !== "prod",
        logLevel:
          import.meta.env.VITE_BUILD_ENV === "prod" ? LogLevel.Error : LogLevel.Verbose,
      },
    });
    pluginReady = true;
  })();

  return readyPromise;
}

export function useGpsTrackerTransistor({
  monitoramentoRotaId,
  enabled,
  paradasCoords,
  config: configOverride,
}: UseGpsTrackerOptions) {
  const cfg: GpsConfig = { ...DEFAULT_CONFIG, ...configOverride };

  const rotaIdRef = useRef<string | null>(monitoramentoRotaId);
  const paradasCoordsRef = useRef<{ lat: number; lng: number }[]>(paradasCoords ?? []);
  const raioAproxRef = useRef<number>(cfg.raio_aproximacao_metros);
  const lastPositionRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const startedRef = useRef<boolean>(false);

  useEffect(() => { rotaIdRef.current = monitoramentoRotaId; }, [monitoramentoRotaId]);
  useEffect(() => { paradasCoordsRef.current = paradasCoords ?? []; }, [paradasCoords]);
  useEffect(() => { raioAproxRef.current = cfg.raio_aproximacao_metros; }, [cfg.raio_aproximacao_metros]);

  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modoCritico, setModoCritico] = useState(false);
  const [pendingQueue, setPendingQueue] = useState(0);

  const checkModoCritico = useCallback((lat: number, lng: number): boolean => {
    const coords = paradasCoordsRef.current;
    if (coords.length === 0) return false;
    const raio = raioAproxRef.current;
    return coords.some((p) => haversine(lat, lng, p.lat, p.lng) <= raio);
  }, []);

  const handleLocation = useCallback(async (location: Location) => {
    const { latitude, longitude, accuracy } = location.coords;
    lastPositionRef.current = { lat: latitude, lng: longitude, accuracy };
    setLastPosition({ lat: latitude, lng: longitude });

    const critico = checkModoCritico(latitude, longitude);
    setModoCritico(critico);

    const rotaId = rotaIdRef.current;
    if (!rotaId) return; // serviço vivo, mas sem rota → não enfileira

    try {
      await enqueue({
        monitoramento_rota_id: rotaId,
        latitude,
        longitude,
        accuracy: accuracy ?? 0,
        timestamp:
          typeof location.timestamp === "string"
            ? location.timestamp
            : new Date(location.timestamp || Date.now()).toISOString(),
        heartbeat: false,
      });
      markEnqueue({ lat: latitude, lng: longitude, accuracy: accuracy ?? 0 });
      setPendingQueue(await pendingCount());
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[GPS Transistor] enqueue falhou", err);
      markError(msg);
    }
  }, [checkModoCritico]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const subscriptions: Array<{ remove: () => void }> = [];

    async function startTracking() {
      if (startedRef.current) return;
      try {
        await ensurePluginReady(cfg.distance_filter_metros);
        if (cancelled) return;

        // Listeners
        const subLoc = BackgroundGeolocation.onLocation(
          handleLocation,
          (err) => {
            const msg = typeof err === "string" ? err : (err as { message?: string })?.message || "GPS error";
            console.warn("[GPS Transistor] location error", err);
            markError(msg);
            setError(msg);
          }
        );
        subscriptions.push(subLoc);

        const subProv = BackgroundGeolocation.onProviderChange((event: ProviderChangeEvent) => {
          console.info("[GPS Transistor] providerChange", event);
          if (!event.enabled) setError("GPS desligado no aparelho");
          else setError(null);
        });
        subscriptions.push(subProv);

        const subMotion = BackgroundGeolocation.onMotionChange((event: MotionChangeEvent) => {
          console.info("[GPS Transistor] motionChange", event.isMoving);
        });
        subscriptions.push(subMotion);

        const state = await BackgroundGeolocation.start();
        if (cancelled) {
          await BackgroundGeolocation.stop().catch(() => {});
          return;
        }
        console.info("[GPS Transistor] iniciado, enabled=", state.enabled);
        startedRef.current = true;
        setTracking(true);
        markWatcherStart();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[GPS Transistor] falha ao iniciar", err);
        setError(`Não foi possível iniciar rastreamento: ${msg}`);
        markError(msg);
      }
    }

    async function stopTracking() {
      try {
        await BackgroundGeolocation.stop();
      } catch (err) {
        console.warn("[GPS Transistor] stop falhou", err);
      }
      for (const s of subscriptions) {
        try { s.remove(); } catch { /* ignore */ }
      }
      startedRef.current = false;
      setTracking(false);
      setModoCritico(false);
    }

    if (enabled) {
      startTracking();

      // Heartbeat de aplicação: a cada 30s enfileira última posição como heartbeat.
      heartbeatTimer = setInterval(async () => {
        const last = lastPositionRef.current;
        const rotaId = rotaIdRef.current;
        if (!last || !rotaId) return;
        try {
          await enqueue({
            monitoramento_rota_id: rotaId,
            latitude: last.lat,
            longitude: last.lng,
            accuracy: last.accuracy,
            timestamp: new Date().toISOString(),
            heartbeat: true,
          });
          setPendingQueue(await pendingCount());
        } catch (err) {
          console.warn("[GPS Transistor] heartbeat enqueue falhou", err);
        }
      }, HEARTBEAT_MS);
    } else {
      stopTracking();
    }

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      stopTracking();
    };
  }, [enabled, handleLocation, cfg.distance_filter_metros]);

  return { tracking, lastPosition, error, modoCritico, pendingQueue };
}
