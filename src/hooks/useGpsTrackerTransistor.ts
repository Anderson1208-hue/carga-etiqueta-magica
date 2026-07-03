import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
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
 * Tracker GPS nativo usando @transistorsoft/capacitor-background-geolocation (v9 grouped config).
 *
 * Por que esse plugin:
 * - Mantém GPS com tela bloqueada, Doze Mode e fabricantes agressivos.
 * - Sobrevive a app em background com Foreground Service e HTTP nativo
 *   (app.stopOnTerminate=false, startOnBoot=true).
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
const NATIVE_LOCATION_INTERVAL_MS = 60_000;
const NATIVE_FASTEST_LOCATION_INTERVAL_MS = 30_000;
const WEBVIEW_FALLBACK_PING_MS = 20_000;

let readyPromise: Promise<void> | null = null;
let startInFlight: Promise<void> | null = null;

/**
 * Serializa chamadas de start(). O SDK Transistorsoft rejeita chamadas
 * concorrentes com "Waiting for previous start action to complete" e deixa
 * o Foreground Service fora do ar — resultado: GPS morre com tela bloqueada.
 *
 * Se o start real falhar (por qualquer motivo), espera até 4s e reconfere
 * o state.enabled — o start anterior às vezes sobe depois do erro sincronico.
 */
async function safeStart(plugin: TSBgGeo, reason: string): Promise<boolean> {
  if (startInFlight) {
    markError(`[transistor] safeStart:aguardando anterior (${reason})`);
    try { await startInFlight; } catch { /* ignore */ }
    const st = await plugin.getState().catch(() => null);
    if (st?.enabled) {
      markError(`[transistor] safeStart:ja-enabled apos wait (${reason})`);
      return true;
    }
  }
  startInFlight = (async () => {
    markNativeStartCalled();
    markError(`[transistor] safeStart:call (${reason})`);
    try {
      await plugin.start();
      markError(`[transistor] safeStart:ok (${reason})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markError(`[transistor] safeStart:erro (${reason}) ${msg}`);
      // "Waiting for previous start action to complete" → aguardar e reconferir
      if (/waiting for previous start/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await plugin.getState().catch(() => null);
        if (st?.enabled) {
          markError(`[transistor] safeStart:recuperado apos wait (${reason})`);
          return;
        }
      }
      throw err;
    }
  })();
  try {
    await startInFlight;
    return true;
  } catch {
    return false;
  } finally {
    startInFlight = null;
  }
}

/**
 * Zera o cache do ensureTransistorGpsReady para forçar um novo ready() do SDK.
 * Necessário quando o usuário concede permissão via Configurações do Android
 * após um ready() com status=Denied — o SDK Transistorsoft cacheia o status
 * internamente e não reavalia sem um novo ready(reset:true).
 */
export function resetTransistorReadyCache(): void {
  readyPromise = null;
}


function buildNativeLocationTemplate(): string {
  return (
    '{"monitoramento_rota_id":"<%= extras.monitoramento_rota_id %>",' +
    '"latitude":<%= latitude %>,"longitude":<%= longitude %>,' +
    '"accuracy":<%= accuracy %>,"heartbeat":false,' +
    `"timestamp":"<%= timestamp %>","client_ts":"<%= timestamp %>","source":"${NATIVE_SOURCE}"}`
  );
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label}:timeout ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function isPageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
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

    let preReadyProviderStatus: number | null = null;
    let preReadyProviderEnabled: boolean | null = null;
    let preReadyProviderGps: boolean | null = null;
    try {
      markError("[transistor] getProviderState:start (pre-ready)");
      const provider = await plugin.getProviderState();
      markNativeProvider(provider);
      preReadyProviderStatus = provider.status ?? null;
      preReadyProviderEnabled = provider.enabled ?? null;
      preReadyProviderGps = provider.gps ?? null;
      markError(
        `[transistor] getProviderState:ok (pre-ready) status=${provider.status} enabled=${provider.enabled} gps=${provider.gps}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[GPS Transistor] getProviderState antes do ready falhou:", err);
      markError(`[transistor] getProviderState:falhou ${msg}`);
    }

    // Android 15 pode negar o popup de requestPermission() (erro=2) quando o
    // usuário já disse "Não perguntar mais" ou quando a permissão FINE foi
    // concedida mas BACKGROUND ainda não — o SDK devolve DENIED cacheado.
    // Estratégia resiliente:
    //   - Se provider.status = Always(3)/WhenInUse(4) → seguir, permissão OK.
    //   - Se provider.enabled=true e provider.gps=true → seguir mesmo assim,
    //     deixamos o ready() tentar; se o OS bloquear de fato, surge lá com
    //     mensagem clara e o motorista vai pra Configurações.
    //   - Caso contrário → abortar com erro amigável indicando abrir Configurações.
    try {
      await requestNativeLocationPermission(plugin, "pre-ready");
    } catch (err) {
      const permissionLikelyOk =
        preReadyProviderStatus === 3 ||
        preReadyProviderStatus === 4 ||
        (preReadyProviderEnabled === true && preReadyProviderGps === true);
      if (permissionLikelyOk) {
        markError(
          `[transistor] requestPermission:pre-ready ignorado (status=${preReadyProviderStatus} enabled=${preReadyProviderEnabled} gps=${preReadyProviderGps})`
        );
      } else {
        markError(
          `[transistor] requestPermission:pre-ready abortando (status=${preReadyProviderStatus} enabled=${preReadyProviderEnabled} gps=${preReadyProviderGps}) — abrir Configurações → Localização`
        );
        throw new Error(
          "Permissão de localização negada pelo Android. Abra Configurações → Apps → Orkestria → Permissões → Localização → 'Permitir o tempo todo'."
        );
      }
    }

    markError("[transistor] ready:start");
    const locationTemplate = buildNativeLocationTemplate();
    // IMPORTANTE: Config v9 do Transistorsoft é AGRUPADA. As opções legacy
    // flat são ignoradas ou mapeadas de forma parcial. Sem `geolocation` e
    // `activity`, o SDK entra em stationary (`isMoving=false`) e só volta a
    // emitir quando a WebView reaparece em foreground.
    markError(`[transistor] ready:config time-based distanceFilter=0 requested=${distanceFilter}`);
    const readyConfig = {
      reset: true,
      geolocation: {
        desiredAccuracy: -1, // DesiredAccuracy.High
        // Android: `locationUpdateInterval` só governa amostragem por tempo quando
        // `distanceFilter` é 0. Com 50m, teste parado + tela bloqueada não gera
        // ponto nativo; app aberto mascarava isso pelo watchdog JS.
        distanceFilter: 0,
        stationaryRadius: 1,
        locationUpdateInterval: NATIVE_LOCATION_INTERVAL_MS,
        fastestLocationUpdateInterval: NATIVE_FASTEST_LOCATION_INTERVAL_MS,
        allowIdenticalLocations: true,
        locationAuthorizationRequest: "Always",
        stopTimeout: 1,
        stopOnStationary: false,
        disableStopDetection: true,
        disableElasticity: true,
        pausesLocationUpdatesAutomatically: false,
      },
      activity: {
        disableStopDetection: true,
        stopOnStationary: false,
        activityRecognitionInterval: 10_000,
        minimumActivityRecognitionConfidence: 0,
      },
      http: {
        url: GPS_ENDPOINT,
        autoSync: true,
        autoSyncThreshold: 0,
        batchSync: false,
        maxBatchSize: 1,
        method: "POST",
        rootProperty: ".",
        timeout: 30_000,
        params: monitoramentoRotaId
          ? { monitoramento_rota_id: monitoramentoRotaId, source: NATIVE_SOURCE }
          : { source: NATIVE_SOURCE },
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON}`,
          apikey: SUPABASE_ANON,
          "Content-Type": "application/json",
        },
      },
      persistence: {
        locationTemplate,
        extras: monitoramentoRotaId ? { monitoramento_rota_id: monitoramentoRotaId } : {},
        persistMode: 1,
      },
      app: {
        stopOnTerminate: false,
        startOnBoot: true,
        // Capacitor v9 NÃO possui headless JS; exigir uma classe Java
        // BackgroundGeolocationHeadlessTask inexistente causa crash-loop no Android
        // quando o sistema dispara eventos após o app sair/encerrar. O envio deve
        // permanecer pelo serviço/HTTP nativo do plugin, sem HeadlessTask custom.
        enableHeadless: false,
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
          priority: 1,
          channelName: "Rastreamento GPS",
        },
      },
      logger: {
        debug: false,
        logLevel: 3,
      },
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

    try {
      await requestNativeLocationPermission(plugin, "post-ready");
    } catch (err) {
      markError(
        `[transistor] requestPermission:post-ready ignorado ${err instanceof Error ? err.message : String(err)}`
      );
    }

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
      persistence: {
        locationTemplate: buildNativeLocationTemplate(),
        extras: { monitoramento_rota_id: monitoramentoRotaId },
        persistMode: 1,
      },
      http: {
        rootProperty: ".",
        params: { monitoramento_rota_id: monitoramentoRotaId, source: NATIVE_SOURCE },
      },
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
    const rawTs = loc.timestamp ?? new Date().toISOString();
    const timestamp = typeof rawTs === "string" ? rawTs : new Date(rawTs).toISOString();
    await enqueueGpsPoint({
      monitoramento_rota_id: monitoramentoRotaId,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? 0,
      timestamp,
      heartbeat: reason.includes("heartbeat") || reason.includes("watchdog"),
    })
      .then(() =>
        markEnqueue({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? 0,
        })
      )
      .catch((err) =>
        markError(`[transistor] force-enqueue:falhou ${err instanceof Error ? err.message : String(err)}`)
      );
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

    async function enqueueWebViewFallback(reason: string) {
      if (!monitoramentoRotaId) return;
      if (!isPageVisible()) return;
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled) return;
          try {
            await enqueueGpsPoint({
              monitoramento_rota_id: monitoramentoRotaId,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? 0,
              timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
              heartbeat: reason !== "webview-fallback-initial",
            });
            markEnqueue({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? 0,
            });
            setLastPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            lastNativeLocationAtRef.current = Date.now();
            setError(null);
            markError(`[transistor] webview-fallback:ok ${reason}`);
          } catch (err) {
            markError(`[transistor] webview-fallback:enqueue-falhou ${err instanceof Error ? err.message : String(err)}`);
          }
        },
        (err) => {
          markError(`[transistor] webview-fallback:gps-falhou ${reason} ${err.code}:${err.message}`);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 }
      );
    }

    // Contenção operacional: se o serviço nativo Transistorsoft ficar bloqueado
    // por cache de permissão do Android 15, ainda assim a Torre recebe posição
    // enquanto o app estiver aberto. Isso recupera o comportamento dos APKs
    // anteriores sem abrir mão do Transistorsoft quando ele conseguir iniciar.
    void enqueueWebViewFallback("webview-fallback-initial");
    const webViewFallbackInterval = window.setInterval(() => {
      const silentFor = Date.now() - lastNativeLocationAtRef.current;
      if (!lastNativeLocationAtRef.current || silentFor >= WEBVIEW_FALLBACK_PING_MS) {
        void enqueueWebViewFallback("webview-fallback-periodic");
      }
    }, WEBVIEW_FALLBACK_PING_MS);
    subsRef.current.push({ remove: () => window.clearInterval(webViewFallbackInterval) });

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
              // Fallback: o uploader HTTP nativo (locationTemplate + rootProperty)
              // estava descartando pontos em silêncio. Enfileira na fila JS, que
              // tem worker funcionando (useGpsQueueWorker -> processar-gps).
              // Backend faz UPSERT por client_ts: se o HTTP nativo um dia voltar
              // a funcionar, dedup automático.
              if (monitoramentoRotaId) {
                const ts = loc.timestamp ?? new Date().toISOString();
                void enqueueGpsPoint({
                  monitoramento_rota_id: monitoramentoRotaId,
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                  accuracy: loc.coords.accuracy ?? 0,
                  timestamp: typeof ts === "string" ? ts : new Date(ts).toISOString(),
                  heartbeat: loc.event === "heartbeat",
                })
                  .then(() =>
                    markEnqueue({
                      lat: loc.coords.latitude,
                      lng: loc.coords.longitude,
                      accuracy: loc.coords.accuracy ?? 0,
                    })
                  )
                  .catch((err) =>
                    markError(`[transistor] enqueue-js:falhou ${err instanceof Error ? err.message : String(err)}`)
                  );
              }
            },
            (errCode) => {
              console.warn("[GPS Transistor] onLocation error:", errCode);
              setError(`GPS erro ${errCode}`);
              markError(`[transistor] onLocation:erro ${errCode}`);
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

        // Reinit resiliente: quando o Android 15 nega a permissão inicialmente,
        // o SDK Transistorsoft cacheia status=Denied mesmo após o usuário
        // conceder "Permitir o tempo todo" nas Configurações. Precisamos
        // detectar essa mudança (via onProviderChange e via retorno ao app)
        // e refazer ready(reset:true) + start() para o SDK reavaliar.
        let reinitInFlight = false;
        async function reinitAfterPermissionGrant(reason: string) {
          if (reinitInFlight) return;
          if (cancelled) return;
          reinitInFlight = true;
          try {
            markError(`[transistor] reinit:start ${reason}`);
            try { await plugin.stop(); } catch { /* ignore */ }
            resetTransistorReadyCache();
            await ensureTransistorGpsReady(config.distance_filter_metros, monitoramentoRotaId);
            const st = await plugin.getState();
            if (!st.enabled) {
              await safeStart(plugin, `reinit-${reason}`);
            }
            try { await plugin.changePace(true); } catch { /* ignore */ }

            const finalSt = await plugin.getState();
            markNativeState({
              enabled: finalSt.enabled,
              isMoving: finalSt.isMoving,
              trackingMode: finalSt.trackingMode,
              notificationConfigured: !!finalSt.app?.notification,
              pendingLocations: await plugin.getCount().catch(() => null),
            });
            markError(`[transistor] reinit:ok ${reason} enabled=${finalSt.enabled}`);
            if (finalSt.enabled) setError(null);
            await forceNativePosition(monitoramentoRotaId, `reinit-${reason}`);
          } catch (err) {
            markError(`[transistor] reinit:falhou ${reason} ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            reinitInFlight = false;
          }
        }

        subsRef.current.push(
          plugin.onProviderChange((provider) => {
            markNativeProvider(provider);
            markError(`[transistor] onProviderChange status=${provider.status} enabled=${provider.enabled} gps=${provider.gps}`);
            // Permissão passou a ser Always(3) ou WhenInUse(4): tentar reiniciar.
            if ((provider.status === 3 || provider.status === 4) && provider.enabled) {
              void plugin.getState().then((st) => {
                if (!st.enabled) void reinitAfterPermissionGrant(`provider-status-${provider.status}`);
              }).catch(() => {
                void reinitAfterPermissionGrant(`provider-status-${provider.status}`);
              });
            }
          })
        );

        // Quando o motorista volta das Configurações do Android para o app,
        // re-verificar permissão e reiniciar tracking se estava travado.
        const appStateSubPromise = App.addListener("appStateChange", async ({ isActive }) => {
          if (!isActive) return;
          if (cancelled) return;
          try {
            const provider = await plugin.getProviderState();
            markNativeProvider(provider);
            markError(`[transistor] appStateChange:active provider.status=${provider.status} enabled=${provider.enabled}`);
            const st = await plugin.getState();
            const permOk = (provider.status === 3 || provider.status === 4) && provider.enabled;
            if (permOk && !st.enabled) {
              void reinitAfterPermissionGrant("app-resume-permission-ok");
            }
          } catch (err) {
            markError(`[transistor] appStateChange:falhou ${err instanceof Error ? err.message : String(err)}`);
          }
        });
        subsRef.current.push({
          remove: () => { void appStateSubPromise.then((h) => h.remove()).catch(() => {}); },
        });

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
          await plugin.changePace(true);
          const moving = await plugin.getState();
          markError(`[transistor] changePace:ok isMoving=${moving.isMoving}`);
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
