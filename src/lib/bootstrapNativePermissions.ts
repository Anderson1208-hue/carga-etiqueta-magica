import { Capacitor } from "@capacitor/core";
import BackgroundGeolocation from "@transistorsoft/capacitor-background-geolocation";

/**
 * Bootstrap de permissões nativas do APK.
 *
 * Por que existe:
 * - O Transistorsoft pede permissão via requestPermission(), sem subir watcher
 *   fantasma. Isso evita conflito com o antigo plugin community, que registrava
 *   o mesmo nome nativo e fazia o APK cair no caminho que para com tela bloqueada.
 *
 * No-op em web.
 */

const KEY = "native_perm_bootstrap_v1";

export async function bootstrapNativePermissions(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Já tentou alguma vez? Não importa o resultado — não insistir em todo boot
  // para não virar spam (Android registra o diálogo já como "negado para sempre"
  // se o usuário fechar várias vezes seguidas).
  try {
    if (localStorage.getItem(KEY) === "1") return;
  } catch {
    /* ignore */
  }

  try {
    await BackgroundGeolocation.requestPermission();
  } catch (err) {
    console.warn("[bootstrapNativePermissions] requestPermission falhou", err);
  } finally {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  }

}
