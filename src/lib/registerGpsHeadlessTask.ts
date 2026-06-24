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
      const registerHeadlessTask = (BackgroundGeolocation as any).registerHeadlessTask;
      if (typeof registerHeadlessTask !== "function") {
        // O pacote Capacitor v9 tipa registerHeadlessTask pelos tipos compartilhados,
        // mas o wrapper JS runtime não expõe esse método. Não depender disso: o
        // upload nativo deve funcionar por locationTemplate/http mesmo sem JS.
        markError("[headless] register:indisponivel no Capacitor v9; usando HTTP nativo");
        return;
      }

      await registerHeadlessTask(async (event: { name: string }) => {
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
