import { Capacitor } from "@capacitor/core";
import { markError } from "@/lib/gpsTelemetry";

let registered = false;

/**
 * Registra a Headless Task do Transistorsoft para Android.
 *
 * Erros vão para markError() para aparecer no diagnóstico do motorista,
 * em vez de ficarem só no logcat.
 */
export function registerGpsHeadlessTask() {
  if (registered) return;
  registered = true;
  if (!Capacitor.isNativePlatform()) return;

  void (async () => {
    try {
      markError("[headless] register:start");
      const mod = await import("@transistorsoft/capacitor-background-geolocation");
      const BackgroundGeolocation = mod.default;
      if (!BackgroundGeolocation) {
        markError("[headless] register:plugin import sem default");
        return;
      }

      await BackgroundGeolocation.registerHeadlessTask(async (event) => {
        try {
          // Não chamar ready/reset aqui: isso pode apagar os extras persistidos
          // da rota ativa (`monitoramento_rota_id`) quando o app está morto.
          if (event.name === "terminate") {
            const state = await BackgroundGeolocation.getState();
            if (!state.enabled) {
              await BackgroundGeolocation.start();
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[GPS Headless] erro:", err);
          markError(`[headless] event:${event.name} ${msg}`);
        }
      });
      markError("[headless] register:ok");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[GPS Headless] registro falhou:", err);
      markError(`[headless] register:falhou ${msg}`);
    }
  })();
}
