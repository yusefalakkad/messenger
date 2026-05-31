/**
 * Унифицированное определение платформы (web | ios | android).
 * Используется для условного включения нативных плагинов и UI-веток.
 */
import { Capacitor } from '@capacitor/core';

export const platform = (): 'web' | 'ios' | 'android' => {
  const p = Capacitor.getPlatform();
  return (p === 'ios' || p === 'android') ? p : 'web';
};

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const isIOS    = (): boolean => platform() === 'ios';
export const isAndroid = (): boolean => platform() === 'android';
export const isWeb    = (): boolean => !isNative();

/** Безопасно проверяет доступность нативного плагина (true только в native билде). */
export const hasPlugin = (name: string): boolean =>
  isNative() && Capacitor.isPluginAvailable(name);
