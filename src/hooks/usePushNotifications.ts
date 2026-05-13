import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Push Notifications híbrido.
 * - APK Android: registra token FCM e salva em `device_push_tokens` (quando habilitar backend de push).
 * - Web: no-op silencioso.
 *
 * Para FCM real funcionar:
 * 1. Criar projeto no Firebase Console.
 * 2. Baixar `google-services.json` e colocar em `android/app/`.
 * 3. Editar `android/build.gradle` e `android/app/build.gradle` conforme docs Capacitor.
 * 4. Implementar persistência do token em `device_push_tokens` (tabela ainda não criada — placeholder abaixo).
 */
export function usePushNotifications(userId: string | null) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !userId) return;

    let mounted = true;

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        const perm = await PushNotifications.checkPermissions();
        let granted = perm.receive === "granted";
        if (!granted) {
          const req = await PushNotifications.requestPermissions();
          granted = req.receive === "granted";
        }
        if (!granted || !mounted) return;

        await PushNotifications.register();

        PushNotifications.addListener("registration", (token) => {
          console.log("[push] token:", token.value);
          // TODO: persistir token em device_push_tokens (criar tabela quando ativar push real)
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.error("[push] registrationError:", err);
        });

        PushNotifications.addListener("pushNotificationReceived", (notif) => {
          console.log("[push] received:", notif);
        });
      } catch (err) {
        console.debug("[push] indisponível:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);
}
