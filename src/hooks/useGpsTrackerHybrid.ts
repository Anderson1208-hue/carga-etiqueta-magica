import { Capacitor } from "@capacitor/core";
import { useGpsTracker } from "./useGpsTracker";
import { useGpsTrackerNative } from "./useGpsTrackerNative";
import { useGpsTrackerTransistor } from "./useGpsTrackerTransistor";

/**
 * Seletor automático de tracker GPS:
 * - Em ambiente nativo (APK Android via Capacitor) → usa Foreground Service
 *   com notificação persistente. GPS continua mesmo com tela bloqueada.
 * - Em ambiente web (navegador / PWA) → usa o tracker web atual
 *   (navigator.geolocation), que requer aba/app em primeiro plano.
 *
 * No nativo escolhemos entre dois plugins:
 * - "transistor" (padrão): @transistorsoft/capacitor-background-geolocation.
 *   Suporta tela bloqueada, Doze Mode e fabricantes agressivos. SEM licença
 *   funciona em debug; release exibe aviso "evaluation only" mas coleta GPS.
 * - "community": @capacitor-community/background-geolocation (implementação
 *   anterior). Fallback de emergência via VITE_GPS_DRIVER=community.
 *
 * Mesma assinatura para todos os caminhos. Drop-in replacement de useGpsTracker.
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

type Driver = "transistor" | "community";
const DRIVER: Driver =
  ((import.meta.env.VITE_GPS_DRIVER as string) || "transistor") === "community"
    ? "community"
    : "transistor";

export function useGpsTrackerHybrid(options: UseGpsTrackerOptions) {
  const isNative = Capacitor.isNativePlatform();
  const useTransistor = isNative && DRIVER === "transistor";

  // IMPORTANTE: TODOS os hooks são chamados sempre (regra dos hooks).
  // Cada um internamente faz no-op quando `enabled` é false ou plataforma errada.
  const transistor = useGpsTrackerTransistor({
    ...options,
    enabled: useTransistor && options.enabled,
  });
  const communityNative = useGpsTrackerNative({
    ...options,
    enabled: isNative && DRIVER === "community" && options.enabled,
  });
  const web = useGpsTracker({
    ...options,
    enabled: !isNative && options.enabled,
  });

  if (isNative) return useTransistor ? transistor : communityNative;
  return web;
}
