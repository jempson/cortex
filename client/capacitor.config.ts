import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farhold.cortex',
  appName: 'Cortex',
  webDir: 'dist',

  // Remote wrapper — loads web app from server (no bundled assets)
  server: {
    url: 'https://cortex.farhold.com',
    allowNavigation: ['cortex.farhold.com'],
  },

  plugins: {
    SplashScreen: {
      backgroundColor: '#050805',
      launchAutoHide: true,
      autoHideDelay: 2000,
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#050805',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },

  android: {
    backgroundColor: '#050805',
  },

  ios: {
    backgroundColor: '#050805',
    contentInset: 'automatic',
  },
};

export default config;
