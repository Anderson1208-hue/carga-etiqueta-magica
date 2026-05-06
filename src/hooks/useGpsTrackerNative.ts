import { useEffect, useRef, useState, useCallback } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Hook nativo para rastreamento GPS em segundo plano via Capacitor.
 * Usa @capacitor-community/background-geolocation, que ativa um
 * Foreground Service Android (notificação persistente) e mantém o GPS
 * rodando mesmo com a tela bloqueada ou app em segundo plano.
 *
 * Mantém EXATAMENTE a mesma interface pública de useGpsTracker.ts
 * para ser drop-in via useGpsTrackerHybrid.
 *
 * IMPORTANTE: este hook só faz qualquer coisa em ambiente nativo.
 * Em browser ele simplesmente fica idle (o seletor híbrido já cuida disso).
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
  intervalo_padrao_segundos: 60,
  intervalo_critico_segundos: 30,
  distance_filter_metros: 100,
  batch_sync_ativo: true,
  batch_max_posicoes: 5,
  raio_aproximacao_metros: 500,
};

interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
}

interface UseGpsTrackerOptions {
  monitoramentoRotaId: string | null;
  enabled: boolean;
  paradasCoords?: { lat: number; lng: number }[];
  config?: Partial<GpsConfig>;
}

// Tipos mínimos do plugin (assinatura oficial)
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
  const batchRef = useRef<GpsPosition[]>([]);
  const lastSentRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFlushRef = useRef<number>(0);

  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modoCritico, setModoCritico] = useState(false);

  const flushBatch = useCallback(
    async (positions: GpsPosition[]) => {
      if (!monitoramentoRotaId || positions.length === 0) return;
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const last = positions[positions.length - 1];
        const res = await fetch(`${supabaseUrl}/functions/v1/processar-gps`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            monitoramento_rota_id: monitoramentoRotaId,
            latitude: last.latitude,
            longitude: last.longitude,
            accuracy: last.accuracy,
            batch: positions,
          }),
        });
        if (res.ok) {
          setLastPosition({ lat: last.latitude, lng: last.longitude });
          lastSentRef.current = { lat: last.latitude, lng: last.longitude };
          lastFlushRef.current = Date.now();
          setError(null);
        }
      } catch (err) {
        console.error("[GPS Native] Erro ao enviar:", err);
        setError("Falha ao enviar posição");
      }
    },
    [monitoramentoRotaId]
  );

  const checkModoCritico = useCallback(
    (lat: number, lng: number): boolean => {
      if (paradasCoords.length === 0) return false;
      return paradasCoords.some(
        (p) => haversine(lat, lng, p.lat, p.lng) <= cfg.raio_aproximacao_metros
      );
    },
    [paradasCoords, cfg.raio_aproximacao_metros]
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      // Em browser este hook é no-op (seletor híbrido cuida do fallback web)
      return;
    }

    let cancelled = false;

    async function start() {
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
          (location, errCb) => {
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
            if (!location) return;

            const { latitude, longitude, accuracy } = location;

            // Distance filter extra (defensivo, além do nativo)
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

            const position: GpsPosition = {
              latitude,
              longitude,
              accuracy,
              timestamp: new Date(location.time ?? Date.now()).toISOString(),
            };

            const critico = checkModoCritico(latitude, longitude);
            setModoCritico(critico);

            // Throttle por intervalo configurado (padrão vs crítico)
            const intervaloMs =
              (critico ? cfg.intervalo_critico_segundos : cfg.intervalo_padrao_segundos) * 1000;
            const elapsed = Date.now() - lastFlushRef.current;

            if (cfg.batch_sync_ativo) {
              batchRef.current.push(position);
              const cheio = batchRef.current.length >= cfg.batch_max_posicoes;
              const respeitouIntervalo = elapsed >= intervaloMs;
              if (cheio || critico || respeitouIntervalo) {
                const toSend = [...batchRef.current];
                batchRef.current = [];
                flushBatch(toSend);
              }
            } else if (elapsed >= intervaloMs || critico) {
              flushBatch([position]);
            }
          }
        );

        if (cancelled) {
          // Foi desabilitado durante a inicialização
          await BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
          return;
        }
        watcherIdRef.current = id;
        setTracking(true);
      } catch (err) {
        console.error("[GPS Native] Falha ao iniciar:", err);
        setError("Não foi possível iniciar o rastreamento nativo");
      }
    }

    async function stop() {
      if (batchRef.current.length > 0) {
        await flushBatch([...batchRef.current]);
        batchRef.current = [];
      }
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

    if (enabled && monitoramentoRotaId) {
      start();
    } else {
      stop();
    }

    return () => {
      cancelled = true;
      stop();
    };
  }, [
    enabled,
    monitoramentoRotaId,
    cfg.distance_filter_metros,
    cfg.batch_sync_ativo,
    cfg.batch_max_posicoes,
    cfg.intervalo_padrao_segundos,
    cfg.intervalo_critico_segundos,
    checkModoCritico,
    flushBatch,
  ]);

  return { tracking, lastPosition, error, modoCritico };
}
