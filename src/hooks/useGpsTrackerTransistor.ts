import { useGpsTrackerNative } from "./useGpsTrackerNative";

/**
 * Tracker GPS nativo usando @transistorsoft/capacitor-background-geolocation.
 *
 * Por que esse plugin (vs @capacitor-community/background-geolocation):
 * - Mantém GPS rodando com tela bloqueada, Doze Mode e fabricantes agressivos
 *   (Xiaomi/Huawei/Samsung/Motorola) — é o padrão de mercado para last-mile.
 * - Sobrevive a app encerrado pelo SO (stopOnTerminate=false, startOnBoot=true).
 * - Foreground Service nativo com notificação persistente já gerenciado pelo plugin.
 *
 * Estratégia:
 * - Posições do plugin → HTTP NATIVO do Transistorsoft → processar-gps.
 *   Isto evita depender de callbacks JS/IndexedDB da WebView com tela bloqueada.
 * - Builds Android release precisam de licença Transistorsoft no Manifest.
 *   Sem licença, use APK debug apenas para validação técnica.
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

export async function ensureTransistorGpsReady(
  _distanceFilter: number = DEFAULT_CONFIG.distance_filter_metros,
  _monitoramentoRotaId: string | null = null
): Promise<void> {
  return;
}

export function useGpsTrackerTransistor({
  monitoramentoRotaId,
  enabled,
  paradasCoords,
  config: configOverride,
}: UseGpsTrackerOptions) {
  return useGpsTrackerNative({ monitoramentoRotaId, enabled, paradasCoords, config: configOverride });
}
