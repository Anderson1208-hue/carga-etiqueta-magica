import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Trava o app em orientação retrato no APK Android.
 * Em ambiente web (preview, PWA) é no-op.
 */
export function useLockPortrait() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let active = true;
    (async () => {
      try {
        const { ScreenOrientation } = await import("@capacitor/screen-orientation");
        if (!active) return;
        await ScreenOrientation.lock({ orientation: "portrait" });
      } catch (err) {
        console.debug("ScreenOrientation lock falhou:", err);
      }
    })();

    return () => {
      active = false;
      // Não desbloqueia ao desmontar — outras telas operacionais também querem retrato.
    };
  }, []);
}
