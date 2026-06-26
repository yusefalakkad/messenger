/**
 * Определение десктоп-ОС + ссылки на установщики ocean.
 *
 * Кнопки «Скачать» используют это, чтобы сразу отдавать нужный файл:
 * macOS → .dmg, Windows → .exe. Для мобилок/прочего — фолбэк (открыть в браузере).
 *
 * Базовый URL переопределяется через VITE_DOWNLOAD_BASE. По умолчанию файлы
 * раздаёт nginx с akkdmsg.online/download (см. nginx.conf + deploy).
 */
export type DesktopOS = 'mac' | 'windows' | 'linux' | 'other';

export function detectOS(): DesktopOS {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const plat = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    || navigator.platform || '';

  // Мобильные — не десктоп: десктопный установщик им не нужен.
  if (/iPhone|iPad|iPod/.test(ua) || /Android/.test(ua)) return 'other';

  if (/Mac/i.test(plat) || /Mac OS X/i.test(ua)) return 'mac';
  if (/Win/i.test(plat) || /Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(plat) || /Linux/i.test(ua)) return 'linux';
  return 'other';
}

const DL_BASE = 'https://akkdmsg.online/download';

/** Стабильные имена (deploy кладёт/симлинкает сюда последнюю сборку). */
export const DESKTOP_DOWNLOADS = {
  mac:     `${DL_BASE}/Dakka.dmg`,
  windows: `${DL_BASE}/Dakka-Setup.exe`,
} as const;

/** Что предложить скачать прямо сейчас, исходя из ОС. url=null → нет десктоп-сборки. */
export function desktopDownload(): { os: DesktopOS; url: string | null; label: string } {
  const os = detectOS();
  if (os === 'mac')     return { os, url: DESKTOP_DOWNLOADS.mac,     label: 'Скачать для macOS' };
  if (os === 'windows') return { os, url: DESKTOP_DOWNLOADS.windows, label: 'Скачать для Windows' };
  return { os, url: null, label: 'Скачать приложение' };
}
