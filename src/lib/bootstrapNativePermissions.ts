import { Capacitor } from "@capacitor/core";

/**
 * Solicita, no primeiro acesso do APK, as permissões runtime necessárias
 * para o Foreground Service de GPS sobreviver com tela bloqueada.
 *
 * Foco: POST_NOTIFICATIONS (Android 13+). Sem essa permissão, a
 * notificação fixa "Rastreamento ativo" não aparece e o Android mata o
 * serviço em segundo plano em minutos.
 *
 * A permissão de localização "o tempo todo" continua sendo tratada pelo
 * wizard ValidacaoGpsBackground (exige passo manual em Configurações).
 */
export async function bootstrapNativePermissions(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const check = await LocalNotifications.checkPermissions();
    if (check.display !== "granted") {
      await LocalNotifications.requestPermissions();
    }
  } catch (err) {
    console.debug("[bootstrapNativePermissions] LocalNotifications indisponível:", err);
  }
}
