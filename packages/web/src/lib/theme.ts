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
  // По умолчанию — auto: подхватываем системную тему ОС (как Telegram/iOS).
  return 'auto';
}

/** Разрешает 'auto' в фактическую тему по системной настройке. */
function resolve(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'auto') {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
      ? 'light' : 'dark';
  }
  return mode;
}

/** Применяет тему к документу + обновляет meta theme-color (status bar).
 *  Смена data-theme = мгновенный репейнт. Фон body НЕ анимируется (см. index.css:
 *  убран transition на background-color), иначе 300мс анимации фона форсили бы
 *  пере-композицию всех backdrop-filter (модалка/сайдбар/инпут) каждый кадр —
 *  это и был «фриз/экран не кликается» при смене темы. Никаких глушилок-классов
 *  больше не нужно: div-поверхности transition не имеют → перекрашиваются разом,
 *  кнопки/инпуты плавно за 200мс (дёшево). */
export function applyTheme(mode: ThemeMode): void {
  const actual = resolve(mode);
  document.documentElement.setAttribute('data-theme', actual);
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
