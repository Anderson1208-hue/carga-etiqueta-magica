import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Bootstrap de permissões nativas do APK.
 *
 * Por que existe:
 * - O plugin background-geolocation só pede permissão quando addWatcher() é
 *   chamado. Como o watcher só sobe DEPOIS que o motorista digita o código
 *   da placa em /motorista-acesso, se ele nunca chegar lá o Android nunca
 *   exibe o diálogo e o GPS fica eternamente em "prompt".
 * - Aqui forçamos a solicitação logo na abertura do APK: subimos um watcher
 *   "fantasma" por ~2s só para o sistema abrir o diálogo e registrar a
 *   permissão, depois removemos. Idempotente: se já foi feito, não repete.
 *
 * No-op em web.
 */

interface BgWatcherOptions {
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
  stale?: boolean;
  distanceFilter?: number;
}
interface BgLocation { latitude: number; longitude: number; }
interface BackgroundGeolocationPlugin {
  addWatcher(
    o: BgWatcherOptions,
    cb: (loc: BgLocation | null, err?: { code: string; message: string }) => void
  ): Promise<string>;
  removeWatcher(o: { id: string }): Promise<void>;
}

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

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

  let watcherId: string | null = null;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: "Liberando GPS",
        backgroundMessage: "Toque em Permitir para usarmos sua localização",
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      () => {
        // não fazemos nada com a posição aqui — só queremos o diálogo
      }
    );
  } catch (err) {
    console.warn("[bootstrapNativePermissions] addWatcher falhou", err);
  } finally {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  }

  // Remove o watcher fantasma após 3s — tempo suficiente para o SO exibir o
  // diálogo e processar a resposta sem deixar Foreground Service rodando.
  if (watcherId) {
    setTimeout(() => {
      BackgroundGeolocation.removeWatcher({ id: watcherId! }).catch(() => {
        /* ignore */
      });
    }, 3000);
  }
}
