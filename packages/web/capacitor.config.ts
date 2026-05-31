import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.akkdmsg.messen',
  appName: 'messen',
  webDir: 'dist',
  bundledWebRuntime: false,

  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    backgroundColor: '#0b0a14',
    limitsNavigationsToAppBoundDomains: false,
  },

  // Production-сервер: на устройстве WebView должен ходить на боевой API.
  // Если хочешь чтобы приложение тянуло JS прямо с прод-домена (live update без пересборки) —
  // раскомментируй `url`. По умолчанию используем bundled web из dist/.
  server: {
    // url: 'https://akkdmsg.online',
    cleartext: false,
    allowNavigation: ['akkdmsg.online', '*.akkdmsg.online'],
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0b0a14',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#7c4dff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b0a14',
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'native',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
