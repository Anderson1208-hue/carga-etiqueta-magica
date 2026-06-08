import { Capacitor } from "@capacitor/core";
import BackgroundGeolocation from "@transistorsoft/capacitor-background-geolocation";
import type { HeadlessEvent } from "@transistorsoft/capacitor-background-geolocation";
import { DesiredAccuracy } from "@transistorsoft/background-geolocation-types";

let registered = false;

export function registerGpsHeadlessTask() {
  if (registered || !Capacitor.isNativePlatform()) return;
  registered = true;

  BackgroundGeolocation.registerHeadlessTask(async (event: HeadlessEvent) => {
    if (event.name !== "heartbeat" && event.name !== "terminate") return;

    try {
      await BackgroundGeolocation.getCurrentPosition({
        samples: 1,
        desiredAccuracy: DesiredAccuracy.High,
        timeout: 30,
        maximumAge: 0,
        persist: true,
      });
    } catch (err) {
      console.warn("[GPS Headless] getCurrentPosition falhou", err);
    }
  });
}