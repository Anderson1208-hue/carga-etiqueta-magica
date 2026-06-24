import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Tracker GPS nativo usando @transistorsoft/capacitor-background-geolocation (v9 nested config).
 *
 * Por que esse plugin:
 * - Mantém GPS com tela bloqueada, Doze Mode e fabricantes agressivos.
 * - Sobrevive a app encerrado (app.stopOnTerminate=false, startOnBoot=true,
 *   enableHeadless=true).
 * - Uploader HTTP NATIVO → posições vão direto a `processar-gps` sem
 *   depender da WebView/JS/IndexedDB com tela bloqueada.
 *
 * Licença Android: <meta-data android:name="com.transistorsoft.locationmanager.license">
 * no AndroidManifest. Cobre PROD (com.orkestria.driver) e STAGING (.staging).
 * Ver docs/TRANSISTORSOFT_SETUP.md.
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

interface UseGpsTrackerOptions {
  monitoramentoRotaId: string | null;
  enabled: boolean;
  paradasCoords?: { lat: number; lng: number }[];
  config?: Partial<GpsConfig>;
}

type TSBgGeo = typeof import("@transistorsoft/capacitor-background-geolocation").default;
let BackgroundGeolocation: TSBgGeo | null = null;
let pluginLoadAttempted = false;

async function loadPlugin(): Promise<TSBgGeo | null> {
  if (BackgroundGeolocation || pluginLoadAttempted) return BackgroundGeolocation;
  pluginLoadAttempted = true;
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import("@transistorsoft/capacitor-background-geolocation");
    BackgroundGeolocation = mod.default;
    return BackgroundGeolocation;
  } catch (err) {
    console.error("[GPS Transistor] falha ao carregar plugin:", err);
    return null;
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const GPS_ENDPOINT = `${SUPABASE_URL}/functions/v1/processar-gps`;

let readyPromise: Promise<void> | null = null;

export async function ensureTransistorGpsReady(
  distanceFilter: number = DEFAULT_CONFIG.distance_filter_metros,
  monitoramentoRotaId: string | null = null
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (readyPromise) {
    await readyPromise;
    if (monitoramentoRotaId) await updateRotaExtras(monitoramentoRotaId);
    return;
  }
  readyPromise = (async () => {
    const plugin = await loadPlugin();
    if (!plugin) throw new Error("Plugin Transistorsoft indisponível");

    await plugin.ready({
      reset: true,
      geolocation: {
        desiredAccuracy: -1, // High
        distanceFilter,
        locationAuthorizationRequest: "Always",
        stopTimeout: 5,
      },
      http: {
        url: GPS_ENDPOINT,
        autoSync: true,
        batchSync: false,
        maxBatchSize: 1,
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON}`,
          apikey: SUPABASE_ANON,
          "Content-Type": "application/json",
        },
      },
      app: {
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        notification: {
          title: "Orkestria — Rota ativa",
          text: "Rastreando posição em segundo plano",
          sticky: true,
          channelName: "Rastreamento GPS",
        },
      },
      persistence: {
        locationTemplate:
          '{"monitoramento_rota_id":"<%= extras.monitoramento_rota_id %>",' +
          '"latitude":<%= latitude %>,"longitude":<%= longitude %>,' +
          '"accuracy":<%= accuracy %>,"heartbeat":false,' +
          '"client_ts":"<%= timestamp %>","source":"transistor-native-http"}',
        extras: monitoramentoRotaId ? { monitoramento_rota_id: monitoramentoRotaId } : {},
      },
      logger: { debug: false, logLevel: 3 },
    });
  })();

  try {
    await readyPromise;
  } catch (err) {
    readyPromise = null;
    throw err;
  }
}

async function updateRotaExtras(monitoramentoRotaId: string): Promise<void> {
  const plugin = BackgroundGeolocation;
  if (!plugin) return;
  try {
    await plugin.setConfig({
      persistence: { extras: { monitoramento_rota_id: monitoramentoRotaId } },
    });
  } catch (err) {
    console.warn("[GPS Transistor] setConfig extras falhou:", err);
  }
}

export function useGpsTrackerTransistor({
  monitoramentoRotaId,
  enabled,
  config: configOverride,
}: UseGpsTrackerOptions) {
  const config = { ...DEFAULT_CONFIG, ...configOverride };
  const [tracking, setTracking] = useState(false);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modoCritico] = useState(false);
  const [pendingQueue, setPendingQueue] = useState(0);
  const subsRef = useRef<Array<{ remove: () => void }>>([]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      try {
        await ensureTransistorGpsReady(config.distance_filter_metros, monitoramentoRotaId);
        const plugin = BackgroundGeolocation;
        if (!plugin || cancelled) return;

        subsRef.current.push(
          plugin.onLocation(
            (loc) => {
              setLastPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
              setError(null);
            },
            (errCode) => {
              console.warn("[GPS Transistor] onLocation error:", errCode);
              setError(`GPS erro ${errCode}`);
            }
          )
        );
        subsRef.current.push(
          plugin.onHttp((res) => {
            if (!res.success) {
              setError(`HTTP ${res.status}`);
            } else {
              setError(null);
            }
          })
        );
        // Atualiza contagem pendente periodicamente via API do plugin.
        const refreshCount = async () => {
          try {
            const c = await plugin.getCount();
            setPendingQueue(c);
          } catch {
            /* ignore */
          }
        };
        const countInterval = window.setInterval(refreshCount, 15_000);
        subsRef.current.push({ remove: () => window.clearInterval(countInterval) });
        void refreshCount();

        const state = await plugin.getState();
        if (!state.enabled) {
          await plugin.start();
        }
        if (!cancelled) setTracking(true);
      } catch (err) {
        console.error("[GPS Transistor] init falhou:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      for (const sub of subsRef.current) {
        try {
          sub.remove();
        } catch {
          /* ignore */
        }
      }
      subsRef.current = [];
    };
  }, [enabled, monitoramentoRotaId, config.distance_filter_metros]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (enabled) return;
    (async () => {
      const plugin = BackgroundGeolocation;
      if (!plugin) return;
      try {
        const state = await plugin.getState();
        if (state.enabled) await plugin.stop();
      } catch (err) {
        console.warn("[GPS Transistor] stop falhou:", err);
      }
      setTracking(false);
    })();
  }, [enabled]);

  return { tracking, lastPosition, error, modoCritico, pendingQueue };
}
