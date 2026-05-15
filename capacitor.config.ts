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
  homolog: {
    url: 'https://carga-etiqueta-magica.lovable.app?forceHideBadge=true',
    cleartext: false,
  },
  prod: undefined,
};

const server = SERVER_BY_ENV[env];

const config: CapacitorConfig = {
  appId: 'app.lovable.2b66d97b1a6e498c96c489ff683a59a4',
  appName: 'Motorista - Carga Etiqueta Mágica',
  webDir: 'dist',
  ...(server ? { server } : {}),
  android: {
    allowMixedContent: env === 'dev',
  },
  plugins: {
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
