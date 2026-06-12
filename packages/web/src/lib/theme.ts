/**
 * Система тем: «dark» | «light» | «auto» (по системной настройке ОС).
 * Применяет data-theme на <html>. Сохраняется в localStorage.
 *
 * Цвета живут в CSS-переменных (index.css :root / [data-theme="light"]),
 * поэтому переключение мгновенное и не требует ре-рендера React.
 */
export type ThemeMode = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'theme';

export function getStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light' || v === 'auto') return v;
  } catch { /* инкогнито */ }
  return 'dark';
}

/** Разрешает 'auto' в фактическую тему по системной настройке. */
function resolve(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'auto') {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
      ? 'light' : 'dark';
  }
  return mode;
}

/** Применяет тему к документу + обновляет meta theme-color (status bar). */
export function applyTheme(mode: ThemeMode): void {
  const actual = resolve(mode);
  const root = document.documentElement;
  root.setAttribute('data-theme', actual);
  // theme-color для PWA/мобильного статус-бара.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', actual === 'light' ? '#f4f2f7' : '#17151e');
}

export function setMode(mode: ThemeMode): void {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* */ }
  applyTheme(mode);
}

/** Вызывать один раз при старте + подписаться на смену системной темы (для auto). */
export function initTheme(): void {
  const mode = getStoredMode();
  applyTheme(mode);
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (getStoredMode() === 'auto') applyTheme('auto');
    });
  }
}
