import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.akkdmsg.dakka',
  appName: 'Dakka',
  webDir: 'dist',
  bundledWebRuntime: false,

  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    backgroundColor: '#17151e',
    // P2-24: ABD=true ограничивает навигацию доменами из Info.plist
    // WKAppBoundDomains. Без этого + wildcard `*.akkdmsg.online` в allowNavigation =
    // potential subdomain takeover → native compromise. Если боевые сабдомены
    // (api, livekit) добавлены в WKAppBoundDomains — приложение работает; если что-то
    // отвалится, проверьте Info.plist.
    limitsNavigationsToAppBoundDomains: true,
  },

  android: {
    backgroundColor: '#17151e',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Edge-to-edge — фон тянется под status/navigation bar, safe-area inset из CSS.
    // Свойство было в Capacitor 5, в v6 удалено — оставляем коммент для истории.
    // Минимальная версия — Android 7.0 / API 24 (примерно 99% устройств)
    // (фактически устанавливается в android/variables.gradle при ios:init)
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'AAB',
    },
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
      backgroundColor: '#17151e',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#7c4dff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#17151e',
      overlaysWebView: true,
    },
    Keyboard: {
      resize: KeyboardResize.Native,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
