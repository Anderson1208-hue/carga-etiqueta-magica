import { Capacitor } from "@capacitor/core";

let registered = false;

/**
 * Registra a headless task do Transistorsoft de forma DEFENSIVA.
 *
 * Importante:
 * - Só executa em plataforma nativa.
 * - Import dinâmico para não quebrar o bundle web (e evitar tela branca
 *   caso o módulo nativo falhe ao carregar em algum dispositivo).
 * - Tudo dentro de try/catch: qualquer falha aqui NÃO pode impedir o
 *   React de montar — preferimos perder o heartbeat em background do que
 *   deixar o app em tela branca.
 */
export function registerGpsHeadlessTask() {
  if (registered) return;
  registered = true;

  if (!Capacitor.isNativePlatform()) return;

  // Defer para depois do mount do React
  setTimeout(() => {
    (async () => {
      try {
        const [{ default: BackgroundGeolocation }, types] = await Promise.all([
          import("@transistorsoft/capacitor-background-geolocation"),
          import("@transistorsoft/background-geolocation-types"),
        ]);

        BackgroundGeolocation.registerHeadlessTask(async (event: { name: string }) => {
          if (event.name !== "heartbeat" && event.name !== "terminate") return;
          try {
            await BackgroundGeolocation.getCurrentPosition({
              samples: 1,
              desiredAccuracy: types.DesiredAccuracy.High,
              timeout: 30,
              maximumAge: 0,
              persist: true,
            });
          } catch (err) {
            console.warn("[GPS Headless] getCurrentPosition falhou", err);
          }
        });
      } catch (err) {
        console.warn("[GPS Headless] registro falhou (ignorado)", err);
      }
    })();
  }, 0);
}
