import { Capacitor } from "@capacitor/core";
import { useGpsTracker } from "./useGpsTracker";
import { useGpsTrackerNative } from "./useGpsTrackerNative";

/**
 * Seletor automático de tracker GPS:
 * - Em ambiente nativo (APK Android via Capacitor) → usa Foreground Service
 *   com notificação persistente. GPS continua mesmo com tela bloqueada.
 * - Em ambiente web (navegador / PWA) → usa o tracker web atual
 *   (navigator.geolocation), que requer aba/app em primeiro plano.
 *
 * Mesma assinatura para os dois caminhos. Drop-in replacement de useGpsTracker.
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

export function useGpsTrackerHybrid(options: UseGpsTrackerOptions) {
  const isNative = Capacitor.isNativePlatform();

  // IMPORTANTE: ambos os hooks são chamados sempre (regra dos hooks).
  // Cada um internamente faz no-op quando não for sua vez.
  const native = useGpsTrackerNative({
    ...options,
    enabled: isNative && options.enabled,
  });
  const web = useGpsTracker({
    ...options,
    enabled: !isNative && options.enabled,
  });

  return isNative ? native : web;
}
