import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  markEnqueue,
  markNativeDriver,
  markNativeHttp,
  markNativeLocation,
  markNativeProvider,
  markNativeReady,
  markNativeRequestPermission,
  markNativeStartCalled,
  markNativeState,
  markError,
} from "@/lib/gpsTelemetry";
import { enqueue as enqueueGpsPoint } from "@/lib/gpsQueue";

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
const BACKGROUND_PERMISSION_RATIONALE =
  "Permita localização o tempo todo para rastrear a rota com a tela bloqueada.";

async function loadPlugin(): Promise<TSBgGeo | null> {
  if (BackgroundGeolocation) return BackgroundGeolocation;
  if (pluginLoadAttempted) return BackgroundGeolocation;
  pluginLoadAttempted = true;
  if (!Capacitor.isNativePlatform()) return null;
  // Marca tentativa para o diagnóstico ver mesmo se o import travar.
  markError("[transistor] loadPlugin:start dynamic import");
  try {
    const mod = await import("@transistorsoft/capacitor-background-geolocation");
    BackgroundGeolocation = mod.default ?? null;
    if (!BackgroundGeolocation) {
      markError("[transistor] loadPlugin:import returned no default export");
    } else {
      markError("[transistor] loadPlugin:ok plugin module carregado");
    }
    return BackgroundGeolocation;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GPS Transistor] falha ao carregar plugin:", err);
    markError(`[transistor] loadPlugin:falhou ${msg}`);
    // Permite retry no próximo mount, em vez de bloquear para sempre.
    pluginLoadAttempted = false;
    return null;
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const GPS_ENDPOINT = `${SUPABASE_URL}/functions/v1/processar-gps`;
const NATIVE_SOURCE = "transistor-native-http";
const PERMISSION_TIMEOUT_MS = 45_000;
const READY_TIMEOUT_MS = 45_000;

let readyPromise: Promise<void> | null = null;

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label}:timeout ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function requestNativeLocationPermission(plugin: TSBgGeo, stage: string): Promise<number | null> {
  try {
    markError(`[transistor] requestPermission:${stage}:start`);
    const status = await withTimeout(
      plugin.requestPermission(),
      `[transistor] requestPermission:${stage}`,
      PERMISSION_TIMEOUT_MS
    );
    markNativeRequestPermission({ status });
    markError(`[transistor] requestPermission:${stage}:ok status=${status}`);
    return status;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markNativeRequestPermission({ status: null, error: msg });
    markError(`[transistor] requestPermission:${stage}:falhou ${msg}`);
    throw err;
  }
}

export async function ensureTransistorGpsReady(
  distanceFilter: number = DEFAULT_CONFIG.distance_filter_metros,
  monitoramentoRotaId: string | null = null
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (readyPromise) {
    await readyPromise;
    if (monitoramentoRotaId) {
      await updateRotaExtras(monitoramentoRotaId);
      await forceNativePosition(monitoramentoRotaId, "route-extras-updated");
    }
    return;
  }
  readyPromise = (async () => {
    markError("[transistor] ensure:start");
    const plugin = await loadPlugin();
    if (!plugin) throw new Error("Plugin Transistorsoft indisponível");

    markNativeDriver({
      routeId: monitoramentoRotaId,
      source: NATIVE_SOURCE,
      httpUrlConfigured: !!GPS_ENDPOINT,
      httpAutoSync: true,
      notificationConfigured: true,
      backgroundPermissionRationale: BACKGROUND_PERMISSION_RATIONALE,
    });
    markError("[transistor] ensure:driver-marked");

    try {
      markError("[transistor] getProviderState:start (pre-ready)");
      const provider = await plugin.getProviderState();
      markNativeProvider(provider);
      markError("[transistor] getProviderState:ok (pre-ready)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[GPS Transistor] getProviderState antes do ready falhou:", err);
      markError(`[transistor] getProviderState:falhou ${msg}`);
    }

    // Android estava ficando em `Permissão GPS: prompt` e o plugin não avançava
    // para ready/start. Solicita a permissão ANTES do ready(), para abrir o
    // diálogo do sistema de forma determinística quando a rota ativa monta.
    await requestNativeLocationPermission(plugin, "pre-ready");

    // IMPORTANTE: Transistorsoft v9 NÃO tem grupo `persistence` na config.
    // `locationTemplate` e `extras` são keys de NÍVEL RAIZ. Aninhar dentro
    // de `persistence` faz a validação do plugin recusar `ready()` em
    // silêncio (a promise nunca resolve em algumas builds), o que explica
    // o travamento observado após loadPlugin:ok.
    markError("[transistor] ready:start");
    // Cast: `locationTemplate` e `extras` são keys de root da Config do
    // plugin (documentadas em transistorsoft/background-geolocation) mas
    // não estão expostas no .d.ts da versão Capacitor. Runtime aceita.
    const readyConfig = {
      reset: true,
      locationTemplate:
        '{"monitoramento_rota_id":"<%= extras.monitoramento_rota_id %>",' +
        '"latitude":<%= latitude %>,"longitude":<%= longitude %>,' +
        '"accuracy":<%= accuracy %>,"heartbeat":false,' +
        `"client_ts":"<%= timestamp %>","source":"${NATIVE_SOURCE}"}`,
      extras: monitoramentoRotaId ? { monitoramento_rota_id: monitoramentoRotaId } : {},
      geolocation: {
        desiredAccuracy: -1, // High
        distanceFilter,
        locationUpdateInterval: 60_000,
        fastestLocationUpdateInterval: 30_000,
        allowIdenticalLocations: true,
        locationAuthorizationRequest: "Always",
        stopTimeout: 5,
      },
      http: {
        url: GPS_ENDPOINT,
        rootProperty: ".",
        autoSync: true,
        batchSync: false,
        maxBatchSize: 1,
        method: "POST",
        params: monitoramentoRotaId
          ? { monitoramento_rota_id: monitoramentoRotaId, source: NATIVE_SOURCE }
          : { source: NATIVE_SOURCE },
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
        heartbeatInterval: 60,
        backgroundPermissionRationale: {
          title: "Localização em segundo plano",
          message: BACKGROUND_PERMISSION_RATIONALE,
          positiveAction: "Abrir permissões",
          negativeAction: "Agora não",
        },
        notification: {
          title: "Orkestria — Rota ativa",
          text: "Rastreando posição em segundo plano",
          sticky: true,
          channelName: "Rastreamento GPS",
        },
      },
      logger: { debug: false, logLevel: 3 },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = await withTimeout(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.ready(readyConfig as any),
      "[transistor] ready",
      READY_TIMEOUT_MS
    );
    markError(`[transistor] ready:ok enabled=${state.enabled} trackingMode=${state.trackingMode}`);
    markNativeReady({ enabled: state.enabled });
    markNativeState({
      enabled: state.enabled,
      isMoving: state.isMoving,
      trackingMode: state.trackingMode,
      notificationConfigured: !!state.app?.notification,
      pendingLocations: await plugin.getCount().catch(() => null),
    });

    await requestNativeLocationPermission(plugin, "post-ready");

    try {
      const provider = await plugin.getProviderState();
      markNativeProvider(provider);
      markError(`[transistor] getProviderState:ok enabled=${provider.enabled} gps=${provider.gps} status=${provider.status}`);
    } catch (err) {
      markError(`[transistor] getProviderState:falhou(post-ready) ${err instanceof Error ? err.message : String(err)}`);
    }

    if (monitoramentoRotaId) {
      await forceNativePosition(monitoramentoRotaId, "ready-initial-position");
    }
    markError("[transistor] ensure:done");
  })();

  try {
    await readyPromise;
  } catch (err) {
    readyPromise = null;
    markNativeReady({ enabled: null, error: err instanceof Error ? err.message : String(err) });
    markError(err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function updateRotaExtras(monitoramentoRotaId: string): Promise<void> {
  const plugin = BackgroundGeolocation;
  if (!plugin) return;
  try {
    await plugin.setConfig({
      extras: { monitoramento_rota_id: monitoramentoRotaId },
      http: { params: { monitoramento_rota_id: monitoramentoRotaId, source: NATIVE_SOURCE } },
    } as any);
    markNativeDriver({
      routeId: monitoramentoRotaId,
      source: NATIVE_SOURCE,
      httpUrlConfigured: true,
      httpAutoSync: true,
      notificationConfigured: true,
      backgroundPermissionRationale: BACKGROUND_PERMISSION_RATIONALE,
    });
  } catch (err) {
    console.warn("[GPS Transistor] setConfig extras falhou:", err);
  }
}

async function forceNativePosition(monitoramentoRotaId: string | null, reason: string): Promise<void> {
  if (!monitoramentoRotaId) return;
  const plugin = BackgroundGeolocation;
  if (!plugin) return;
  try {
    markError(`[transistor] getCurrentPosition:start ${reason}`);
    const loc = await plugin.getCurrentPosition({
      samples: 1,
      desiredAccuracy: -1,
      timeout: 30,
      maximumAge: 0,
      persist: true,
      extras: { monitoramento_rota_id: monitoramentoRotaId },
    });
    markNativeLocation({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      event: reason,
    });
    markError(`[transistor] getCurrentPosition:ok ${reason}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[GPS Transistor] getCurrentPosition falhou (${reason}):`, err);
    markError(`[transistor] getCurrentPosition:falhou ${reason} ${msg}`);
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
  const lastNativeLocationAtRef = useRef<number>(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!enabled) return;

    // Marca o driver como ativo SEM tocar em `source` (vide gpsTelemetry).
    markNativeDriver({ routeId: monitoramentoRotaId });
    markError(`[transistor] effect:mounted rotaId=${monitoramentoRotaId ?? "null"}`);

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
              markNativeLocation({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                accuracy: loc.coords.accuracy,
                event: loc.event ?? null,
              });
              lastNativeLocationAtRef.current = Date.now();
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
            markNativeHttp(res);
            if (!res.success) {
              setError(`HTTP ${res.status}`);
            } else {
              setError(null);
            }
          })
        );
        subsRef.current.push(
          plugin.onProviderChange((provider) => {
            markNativeProvider(provider);
          })
        );
        subsRef.current.push(
          plugin.onHeartbeat(async () => {
            try {
              const loc = await plugin.getCurrentPosition({
                samples: 1,
                desiredAccuracy: -1,
                timeout: 30,
                maximumAge: 60_000,
                persist: true,
                extras: monitoramentoRotaId ? { monitoramento_rota_id: monitoramentoRotaId } : {},
              });
              markNativeLocation({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                accuracy: loc.coords.accuracy,
                event: "heartbeat",
              });
              lastNativeLocationAtRef.current = Date.now();
            } catch (err) {
              console.warn("[GPS Transistor] heartbeat getCurrentPosition falhou:", err);
              markError(`[transistor] heartbeat getCurrentPosition:falhou ${err instanceof Error ? err.message : String(err)}`);
            }
          })
        );
        const forcedPositionInterval = window.setInterval(() => {
          if (!monitoramentoRotaId) return;
          if (document.visibilityState !== "visible") return;
          const silentFor = Date.now() - lastNativeLocationAtRef.current;
          if (!lastNativeLocationAtRef.current || silentFor > 60_000) {
            void forceNativePosition(monitoramentoRotaId, "foreground-watchdog");
          }
        }, 60_000);
        subsRef.current.push({ remove: () => window.clearInterval(forcedPositionInterval) });
        // Atualiza contagem pendente periodicamente via API do plugin.
        const refreshCount = async () => {
          try {
            const c = await plugin.getCount();
            setPendingQueue(c);
            const state = await plugin.getState();
            markNativeState({
              enabled: state.enabled,
              isMoving: state.isMoving,
              trackingMode: state.trackingMode,
              notificationConfigured: !!state.app?.notification,
              pendingLocations: c,
            });
          } catch {
            /* ignore */
          }
        };
        const countInterval = window.setInterval(refreshCount, 15_000);
        subsRef.current.push({ remove: () => window.clearInterval(countInterval) });
        void refreshCount();

        const state = await plugin.getState();
        if (!state.enabled) {
          markNativeStartCalled();
          const started = await plugin.start();
          markNativeState({
            enabled: started.enabled,
            isMoving: started.isMoving,
            trackingMode: started.trackingMode,
            notificationConfigured: !!started.app?.notification,
            pendingLocations: await plugin.getCount().catch(() => null),
          });
        } else {
          markNativeState({
            enabled: state.enabled,
            isMoving: state.isMoving,
            trackingMode: state.trackingMode,
            notificationConfigured: !!state.app?.notification,
            pendingLocations: await plugin.getCount().catch(() => null),
          });
        }
        try {
          const moving = await plugin.changePace(true);
          markNativeState({
            enabled: moving.enabled,
            isMoving: moving.isMoving,
            trackingMode: moving.trackingMode,
            notificationConfigured: !!moving.app?.notification,
            pendingLocations: await plugin.getCount().catch(() => null),
          });
        } catch (err) {
          markError(`[transistor] changePace:falhou ${err instanceof Error ? err.message : String(err)}`);
        }
        await forceNativePosition(monitoramentoRotaId, "after-start");
        if (!cancelled) setTracking(true);
      } catch (err) {
        console.error("[GPS Transistor] init falhou:", err);
        markError(err instanceof Error ? err.message : String(err));
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
        markNativeState({
          enabled: false,
          isMoving: false,
          trackingMode: state.trackingMode,
          notificationConfigured: !!state.app?.notification,
          pendingLocations: await plugin.getCount().catch(() => null),
        });
      } catch (err) {
        console.warn("[GPS Transistor] stop falhou:", err);
      }
      setTracking(false);
    })();
  }, [enabled]);

  return { tracking, lastPosition, error, modoCritico, pendingQueue };
}
