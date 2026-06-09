import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuração Capacitor — 3 ambientes.
 *
 * DEV     (CAP_ENV=dev | default): aponta para o sandbox Lovable (hot-reload).
 *         Use no dia a dia de desenvolvimento. Precisa de internet para abrir.
 *
 * STAGING (CAP_ENV=staging): APK embutido (capacitor://localhost), igual PROD,
 *         só muda badge + VITE_BUILD_ENV + applicationId. Sufixo `.staging` é
 *         oficialmente aceito pela mesma licença Transistorsoft do PROD.
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
  // STAGING roda EMBUTIDO (igual PROD). Nunca aponta para lovable.app
  // — APKs de motorista não podem depender de auth Lovable / lovable.dev/login.
  // Diferença STAGING vs PROD = badge + VITE_BUILD_ENV + applicationId apenas.
  staging: undefined,
  prod: undefined,
};

// applicationId por ambiente — permite PROD e STAGING coexistirem no mesmo
// celular sem um sobrescrever o outro. DEV usa o mesmo id do STAGING (mesmo
// app, hot-reload apenas muda a fonte do frontend).
// applicationId Orkestria (SaaS multi-tenant). Sufixo `.staging` é aceito
// oficialmente pela licença Transistorsoft emitida para com.orkestria.driver
// (PROD) — não exige licença separada.
// HOMOLOG = ambiente estável que reproduz exatamente o APK que funcionou em campo
// (MOTORISTA-homolog-assinado.apk, driver @capacitor-community/background-geolocation).
// Coexiste com PROD e STAGING no mesmo aparelho.
const APP_ID_BY_ENV: Record<string, string> = {
  dev:     'com.orkestria.driver.homolog',
  homolog: 'com.orkestria.driver.homolog',
  staging: 'com.orkestria.driver.staging',
  prod:    'com.orkestria.driver',
};

const APP_NAME_BY_ENV: Record<string, string> = {
  dev:     'Orkestria Driver DEV',
  homolog: 'Orkestria Driver HOMOLOG',
  staging: 'Orkestria Driver STAGING',
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
