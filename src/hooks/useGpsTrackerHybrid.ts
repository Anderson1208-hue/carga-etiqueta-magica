import { Capacitor } from "@capacitor/core";
import { useGpsTracker } from "./useGpsTracker";
import { useGpsTrackerNative } from "./useGpsTrackerNative";
import { useGpsTrackerTransistor } from "./useGpsTrackerTransistor";

/**
 * Seletor automático de tracker GPS.
 *
 * Roteamento por ambiente (VITE_BUILD_ENV):
 *   - web (não-nativo)        → useGpsTracker (navigator.geolocation)
 *   - nativo + staging|prod   → useGpsTrackerTransistor (HTTP nativo, com licença)
 *   - nativo + homolog|dev    → useGpsTrackerNative (community, fallback livre)
 *
 * Override manual (debug): VITE_GPS_DRIVER=community|transistor força um driver.
 *
 * Regra dos hooks: TODOS são sempre chamados; quem não é alvo recebe enabled=false.
 */
interface GpsConfig {
  intervalo_padrao_segundos: number;
  intervalo_critico_segundos: number;
  distance_filter_metros: number;
  batch_sync_ativo: boolean;
  batch_max_posicoes: number;
  raio_aproximacao_metros: number;
}

interface UseGpsTrackerOptions {
  monitoramentoRotaId: string | null;
  enabled: boolean;
  paradasCoords?: { lat: number; lng: number }[];
  config?: Partial<GpsConfig>;
}

type Driver = "web" | "transistor" | "community";

function resolveDriver(): Driver {
  if (!Capacitor.isNativePlatform()) return "web";
  const forced = import.meta.env.VITE_GPS_DRIVER as string | undefined;
  if (forced === "transistor") return "transistor";
  if (forced === "community") return "community";
  const env = (import.meta.env.VITE_BUILD_ENV as string | undefined) ?? "dev";
  if (env === "staging" || env === "prod") return "transistor";
  return "community";
}

export function useGpsTrackerHybrid(options: UseGpsTrackerOptions) {
  const driver = resolveDriver();

  const transistor = useGpsTrackerTransistor({
    ...options,
    enabled: driver === "transistor" && options.enabled,
  });
  const native = useGpsTrackerNative({
    ...options,
    enabled: driver === "community" && options.enabled,
  });
  const web = useGpsTracker({
    ...options,
    enabled: driver === "web" && options.enabled,
  });

  if (driver === "transistor") return transistor;
  if (driver === "community") return native;
  return web;
}
