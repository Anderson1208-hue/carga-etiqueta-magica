import { Capacitor } from "@capacitor/core";
import { ensureTransistorGpsReady } from "@/hooks/useGpsTrackerTransistor";

let registered = false;

/**
 * Registra a Headless Task do Transistorsoft para Android.
 *
 * Por que existe: quando o SO mata o app, o plugin reaparece em headless mode
 * (sem WebView/JS rodando). Precisamos garantir que o Foreground Service
 * permaneça ativo e o uploader HTTP nativo continue enviando.
 *
 * Como o envio é 100% nativo via http.url, não precisamos processar locations
 * em JS aqui — só re-ensure config + manter o plugin ligado em eventos críticos
 * (terminate, heartbeat, http).
 */
export function registerGpsHeadlessTask() {
  if (registered) return;
  registered = true;
  if (!Capacitor.isNativePlatform()) return;

  void (async () => {
    try {
      const mod = await import("@transistorsoft/capacitor-background-geolocation");
      const BackgroundGeolocation = mod.default;

      await BackgroundGeolocation.registerHeadlessTask(async (event) => {
        // event.name ∈ "terminate" | "heartbeat" | "location" | "http" | ...
        try {
          await ensureTransistorGpsReady();
          if (event.name === "terminate") {
            // Garante restart do tracking após terminate do app.
            const state = await BackgroundGeolocation.getState();
            if (!state.enabled) {
              await BackgroundGeolocation.start();
            }
          }
        } catch (err) {
          console.warn("[GPS Headless] erro:", err);
        }
      });
    } catch (err) {
      console.warn("[GPS Headless] registro falhou:", err);
    }
  })();
}
