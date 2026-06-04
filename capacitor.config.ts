import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuração Capacitor — 3 ambientes.
 *
 * DEV     (CAP_ENV=dev | default): aponta para o sandbox Lovable (hot-reload).
 *         Use no dia a dia de desenvolvimento. Precisa de internet para abrir.
 *
 * HOMOLOG (CAP_ENV=homolog): aponta para a URL publicada Lovable
 *         (carga-etiqueta-magica.lovable.app). O APK busca o frontend
 *         publicado — útil para validar uma versão "candidata" sem precisar
 *         gerar APK embedded a cada teste. Backend é o mesmo do PROD.
 *
 * PROD    (CAP_ENV=prod): omite `server.url`. APK roda /dist embutido
 *         (capacitor://localhost). Funciona offline. Único modo distribuído
 *         para os motoristas em operação real.
 *
 * Sempre que mudar de modo: `npm run build && npx cap sync android`.
 */
const env = (process.env.CAP_ENV || 'dev').toLowerCase();

const SERVER_BY_ENV: Record<string, { url: string; cleartext: boolean } | undefined> = {
  dev: {
    url: 'https://2b66d97b-1a6e-498c-96c4-89ff683a59a4.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  // HOMOLOG agora roda EMBUTIDO (igual PROD). Nunca aponta para lovable.app
  // — APKs de motorista não podem depender de auth Lovable / lovable.dev/login.
  // Diferença HOMOLOG vs PROD = badge + VITE_BUILD_ENV + applicationId apenas.
  homolog: undefined,
  prod: undefined,
};

// applicationId por ambiente — permite PROD e HOMOLOG coexistirem no mesmo
// celular sem um sobrescrever o outro. DEV usa o mesmo id do HOMOLOG (mesmo
// app, hot-reload apenas muda a fonte do frontend).
// applicationId Orkestria (SaaS multi-tenant). Cada ambiente tem id próprio
// para coexistirem no mesmo celular. A licença Transistorsoft (quando
// adquirida) será emitida para com.orkestria.driver (PROD).
const APP_ID_BY_ENV: Record<string, string> = {
  dev:     'com.orkestria.driver.homolog',
  homolog: 'com.orkestria.driver.homolog',
  prod:    'com.orkestria.driver',
};

const APP_NAME_BY_ENV: Record<string, string> = {
  dev:     'Orkestria Driver DEV',
  homolog: 'Orkestria Driver HOMOLOG',
  prod:    'Orkestria Driver',
};

const server = SERVER_BY_ENV[env];

const config: CapacitorConfig = {
  appId: APP_ID_BY_ENV[env] ?? APP_ID_BY_ENV.prod,
  appName: APP_NAME_BY_ENV[env] ?? APP_NAME_BY_ENV.prod,
  webDir: 'dist',
  ...(server ? { server } : {}),
  android: {
    allowMixedContent: env === 'dev',
    // Recomendação oficial do plugin @capacitor-community/background-geolocation:
    // sem o legacy bridge, callbacks de localização podem parar depois de alguns
    // minutos em segundo plano no Android/WebView.
    useLegacyBridge: true,
  },
  plugins: {
    // Em background, Android pode limitar HTTP iniciado pelo WebView após ~5min.
    // Habilita o fetch/XHR nativo do Capacitor para o worker da fila GPS continuar
    // drenando pontos mesmo com o APK em segundo plano.
    CapacitorHttp: {
      enabled: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#ffffff',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
