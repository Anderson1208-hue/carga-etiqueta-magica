import { useEffect, useRef, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import BackgroundGeolocation from "@transistorsoft/capacitor-background-geolocation";
import type {
  Config,
  HttpEvent,
  Location,
  MotionChangeEvent,
  ProviderChangeEvent,
} from "@transistorsoft/capacitor-background-geolocation";
import {
  AuthorizationStatus,
  DesiredAccuracy,
  HttpMethod,
  LogLevel,
  NotificationPriority,
  PersistMode,
} from "@transistorsoft/background-geolocation-types";
import {
  authorizationStatusText,
  markEnqueue,
  markError,
  markNativeDriver,
  markNativeHttp,
  markNativeLocation,
  markNativeProvider,
  markNativeReady,
  markNativeStartCalled,
  markNativeState,
  markSent,
  markWatcherStart,
} from "@/lib/gpsTelemetry";

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
 * - Posições do plugin → HTTP NATIVO do Transistorsoft → processar-gps.
 *   Isto evita depender de callbacks JS/IndexedDB da WebView com tela bloqueada.
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

const NATIVE_SOURCE = "transistor-native-http";

const NATIVE_LOCATION_TEMPLATE = JSON.stringify({
  latitude: "<%= latitude %>",
  longitude: "<%= longitude %>",
  accuracy: "<%= accuracy %>",
  timestamp: "<%= timestamp %>",
  heartbeat: false,
  battery: "<%= battery.level %>",
  event: "<%= event %>",
})
  .replace('"<%= latitude %>"', "<%= latitude %>")
  .replace('"<%= longitude %>"', "<%= longitude %>")
  .replace('"<%= accuracy %>"', "<%= accuracy %>")
  .replace('"<%= battery.level %>"', "<%= battery.level %>");

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
let currentDistanceFilter: number | null = null;
let currentNativeRouteId: string | null = null;

function buildNativeUploadConfig(monitoramentoRotaId: string | null, distanceFilter: number): Config {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  return {
    geolocation: {
      desiredAccuracy: DesiredAccuracy.High,
      distanceFilter,
      stationaryRadius: 25,
      locationAuthorizationRequest: "Always" as const,
      locationUpdateInterval: 30_000,
      fastestLocationUpdateInterval: 10_000,
      allowIdenticalLocations: true,
      pausesLocationUpdatesAutomatically: false,
      disableStopDetection: true,
    },
    activity: {
      disableStopDetection: true,
      stopOnStationary: false,
    },
    app: {
      heartbeatInterval: 60,
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
    http: monitoramentoRotaId
      ? {
          url: `${supabaseUrl}/functions/v1/processar-gps`,
          method: HttpMethod.Post,
          autoSync: true,
          batchSync: false,
          rootProperty: ".",
          timeout: 30_000,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          params: {
            monitoramento_rota_id: monitoramentoRotaId,
            source: NATIVE_SOURCE,
          },
        }
      : {
          autoSync: false,
          batchSync: false,
        },
    persistence: {
      persistMode: PersistMode.All,
      maxDaysToPersist: 3,
      maxRecordsToPersist: 5000,
      locationTemplate: NATIVE_LOCATION_TEMPLATE,
    },
  };
}

export async function ensureTransistorGpsReady(
  distanceFilter: number = DEFAULT_CONFIG.distance_filter_metros,
  monitoramentoRotaId: string | null = null
): Promise<void> {
  const markConfig = () => {
    const cfg = buildNativeUploadConfig(monitoramentoRotaId, distanceFilter);
    markNativeDriver({
      routeId: monitoramentoRotaId,
      source: monitoramentoRotaId ? NATIVE_SOURCE : null,
      httpUrlConfigured: Boolean(cfg.http?.url),
      httpAutoSync: cfg.http?.autoSync ?? null,
      notificationConfigured: Boolean(cfg.app?.notification),
      backgroundPermissionRationale: cfg.app?.backgroundPermissionRationale?.message ?? null,
    });
  };

  if (pluginReady) {
    if (currentDistanceFilter !== distanceFilter || currentNativeRouteId !== monitoramentoRotaId) {
      await BackgroundGeolocation.setConfig(buildNativeUploadConfig(monitoramentoRotaId, distanceFilter));
      currentDistanceFilter = distanceFilter;
      currentNativeRouteId = monitoramentoRotaId;
    }
    markConfig();
    return;
  }
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    try {
      const state = await BackgroundGeolocation.ready({
        reset: true,
        ...buildNativeUploadConfig(monitoramentoRotaId, distanceFilter),
        logger: {
          debug: import.meta.env.VITE_BUILD_ENV !== "prod",
          logLevel:
            import.meta.env.VITE_BUILD_ENV === "prod" ? LogLevel.Error : LogLevel.Verbose,
        },
      });
      markNativeReady({ enabled: state.enabled });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markNativeReady({ error: msg });
      throw err;
    }
    pluginReady = true;
    currentDistanceFilter = distanceFilter;
    currentNativeRouteId = monitoramentoRotaId;
    markConfig();
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
  const startedRef = useRef<boolean>(false);

  useEffect(() => { rotaIdRef.current = monitoramentoRotaId; }, [monitoramentoRotaId]);
  useEffect(() => { paradasCoordsRef.current = paradasCoords ?? []; }, [paradasCoords]);
  useEffect(() => { raioAproxRef.current = cfg.raio_aproximacao_metros; }, [cfg.raio_aproximacao_metros]);

  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modoCritico, setModoCritico] = useState(false);
  const [pendingQueue] = useState(0);

  const checkModoCritico = useCallback((lat: number, lng: number): boolean => {
    const coords = paradasCoordsRef.current;
    if (coords.length === 0) return false;
    const raio = raioAproxRef.current;
    return coords.some((p) => haversine(lat, lng, p.lat, p.lng) <= raio);
  }, []);

  const handleLocation = useCallback(async (location: Location) => {
    const { latitude, longitude, accuracy } = location.coords;
    setLastPosition({ lat: latitude, lng: longitude });
    markNativeLocation({ lat: latitude, lng: longitude, accuracy: accuracy ?? 0, event: location.event ?? null });

    const critico = checkModoCritico(latitude, longitude);
    setModoCritico(critico);

    // Apenas telemetria local para diagnóstico. O envio real agora é NATIVO
    // pelo HTTP service do Transistorsoft, sem depender da WebView acordada.
    if (rotaIdRef.current) markEnqueue({ lat: latitude, lng: longitude, accuracy: accuracy ?? 0 });
    setError(null);
  }, [checkModoCritico]);

  const handleHttp = useCallback((event: HttpEvent) => {
    markNativeHttp(event);
    if (event.success && event.status >= 200 && event.status < 300) {
      markSent(1);
      setError(null);
      return;
    }
    const msg = `HTTP nativo GPS falhou (${event.status}): ${event.responseText || "sem resposta"}`;
    console.warn("[GPS Transistor]", msg);
    markError(msg);
    setError(msg);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const subscriptions: Array<{ remove: () => void }> = [];

    async function startTracking() {
      if (startedRef.current) return;
      try {
        await ensureTransistorGpsReady(cfg.distance_filter_metros, monitoramentoRotaId);
        if (cancelled) return;

        const provider = await BackgroundGeolocation.getProviderState();
        markNativeProvider(provider);
        if (provider.status !== AuthorizationStatus.Always) {
          const msg = `Autorização nativa insuficiente: ${authorizationStatusText(provider.status)} (${provider.status}). Necessário: Always (3).`;
          console.warn("[GPS Transistor]", msg, provider);
          markError(msg);
          setError(msg);
          setTracking(false);
          return;
        }

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
          markNativeProvider(event);
          if (!event.enabled) setError("GPS desligado no aparelho");
          else setError(null);
        });
        subscriptions.push(subProv);

        const subMotion = BackgroundGeolocation.onMotionChange((event: MotionChangeEvent) => {
          console.info("[GPS Transistor] motionChange", event.isMoving);
        });
        subscriptions.push(subMotion);

        const subHttp = BackgroundGeolocation.onHttp(handleHttp);
        subscriptions.push(subHttp);

        markNativeStartCalled();
        const state = await BackgroundGeolocation.start();
        await BackgroundGeolocation.changePace(true).catch(() => {});
        const pendingLocations = await BackgroundGeolocation.getCount().catch(() => null);
        markNativeState({
          enabled: state.enabled,
          isMoving: state.isMoving,
          trackingMode: state.trackingMode,
          notificationConfigured: Boolean(state.app?.notification),
          pendingLocations,
        });
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
        const state = await BackgroundGeolocation.stop();
        markNativeState({
          enabled: state.enabled,
          isMoving: state.isMoving,
          trackingMode: state.trackingMode,
          notificationConfigured: Boolean(state.app?.notification),
        });
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
    } else {
      stopTracking();
    }

    return () => {
      cancelled = true;
      stopTracking();
    };
  }, [enabled, handleLocation, handleHttp, cfg.distance_filter_metros, monitoramentoRotaId]);

  return { tracking, lastPosition, error, modoCritico, pendingQueue };
}
