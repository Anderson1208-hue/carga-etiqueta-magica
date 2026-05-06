import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuração Capacitor.
 *
 * MODO DEV (hot-reload do sandbox Lovable):
 *   export CAP_ENV=dev && npx cap sync android
 *
 * MODO PROD (APK assinado para distribuição aos motoristas):
 *   export CAP_ENV=prod && npm run build && npx cap sync android
 *   (em prod o bloco `server.url` é omitido e o APK roda /dist embutido)
 */
const isProd = process.env.CAP_ENV === 'prod';

const config: CapacitorConfig = {
  appId: 'app.lovable.2b66d97b1a6e498c96c489ff683a59a4',
  appName: 'Motorista - Carga Etiqueta Mágica',
  webDir: 'dist',
  ...(isProd
    ? {}
    : {
        server: {
          url: 'https://2b66d97b-1a6e-498c-96c4-89ff683a59a4.lovableproject.com?forceHideBadge=true',
          cleartext: true,
        },
      }),
  android: {
    allowMixedContent: true,
  },
  plugins: {
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
