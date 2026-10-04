import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.anva.folio',
  appName: 'Folio',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};
export default config;
