import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.2b66d97b1a6e498c96c489ff683a59a4',
  appName: 'Motorista - Carga Etiqueta Mágica',
  webDir: 'dist',
  server: {
    // Hot-reload do sandbox Lovable durante desenvolvimento.
    // Para o build de PRODUÇÃO (APK final), comente o bloco "url" para empacotar
    // o conteúdo de /dist diretamente no APK.
    url: 'https://2b66d97b-1a6e-498c-96c4-89ff683a59a4.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
