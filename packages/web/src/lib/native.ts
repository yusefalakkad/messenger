/**
 * Инициализация нативных плагинов Capacitor.
 * Безопасно вызывается в web — все вызовы заворачиваем в isNative().
 */
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PushNotifications } from '@capacitor/push-notifications';
import { Share } from '@capacitor/share';
import { isNative, isIOS } from './platform';
import { api } from './api';

let initialized = false;

/** Точка входа. Вызывать один раз при старте приложения. */
export async function initNative(): Promise<void> {
  if (!isNative() || initialized) return;
  initialized = true;

  // Статусбар: dark-стиль, прозрачный, контент выезжает под него
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#17151e' });
    if (isIOS()) {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch { /* no-op */ }

  // Клавиатура: подстраиваем верстку через CSS-переменную
  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      document.documentElement.classList.add('keyboard-open');
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.documentElement.classList.remove('keyboard-open');
    });
  } catch { /* no-op */ }

  // App lifecycle — подтягиваем чаты при возврате из бэкграунда
  try {
    CapApp.addListener('appStateChange', ({ isActive }) => {
      window.dispatchEvent(new CustomEvent(isActive ? 'app:foreground' : 'app:background'));
    });
    CapApp.addListener('backButton', () => {
      // Только Android; iOS этот listener не вызывает
      if (window.history.length > 1) window.history.back();
      else CapApp.exitApp();
    });
  } catch { /* no-op */ }

  // Network status в окно
  try {
    const status = await Network.getStatus();
    document.documentElement.dataset.netStatus = status.connected ? 'online' : 'offline';
    Network.addListener('networkStatusChange', (s) => {
      document.documentElement.dataset.netStatus = s.connected ? 'online' : 'offline';
      window.dispatchEvent(new CustomEvent('app:network', { detail: s }));
    });
  } catch { /* no-op */ }

  // Прячем splash после загрузки React-приложения
  // (даём UI ~300мс отрисоваться, чтобы избежать вспышки чёрного)
  setTimeout(() => {
    SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
  }, 300);
}

// ─── Push Notifications ──────────────────────────────────────────────────────

/** Запрос разрешения и регистрация на APNs/FCM. Вызывать после успешного логина. */
export async function registerPushNotifications(userId: string): Promise<void> {
  if (!isNative()) return;
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== 'granted') return;
    }

    // Слушаем регистрацию ДО вызова register() — иначе можем пропустить событие
    PushNotifications.addListener('registration', async (token) => {
      try {
        await api.post('/push/native-token', {
          userId,
          platform: isIOS() ? 'ios' : 'android',
          token: token.value,
        });
      } catch (err) {
        console.error('[Push] Не удалось зарегистрировать токен на бэкенде', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] registration error', err);
    });

    // Полученное сообщение в форегрунде — диспатчим внутрь приложения
    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      window.dispatchEvent(new CustomEvent('app:push', { detail: notif }));
    });

    // Тап по уведомлению из бэкграунда
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const chatId = (action.notification.data as any)?.chatId;
      if (chatId) {
        window.dispatchEvent(new CustomEvent('app:push-open', { detail: { chatId } }));
      }
    });

    await PushNotifications.register();
  } catch (err) {
    console.error('[Push] init failed', err);
  }
}

// ─── Haptics ──────────────────────────────────────────────────────────────────

export const haptic = {
  light:  () => isNative() && Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}),
  medium: () => isNative() && Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}),
  heavy:  () => isNative() && Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}),
  success: () => isNative() && Haptics.notification({ type: NotificationType.Success }).catch(() => {}),
  warning: () => isNative() && Haptics.notification({ type: NotificationType.Warning }).catch(() => {}),
  error:   () => isNative() && Haptics.notification({ type: NotificationType.Error }).catch(() => {}),
  selection: () => isNative() && Haptics.selectionStart().then(() => Haptics.selectionEnd()).catch(() => {}),
};

// ─── Share ────────────────────────────────────────────────────────────────────

export async function nativeShare(opts: { title?: string; text?: string; url?: string }) {
  if (!isNative()) {
    // Fallback на Web Share API
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share(opts); } catch {}
    }
    return;
  }
  try { await Share.share(opts); } catch {}
}
