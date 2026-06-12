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

let unsuppressRaf = 0;

/** Применяет тему к документу + обновляет meta theme-color (status bar). */
export function applyTheme(mode: ThemeMode): void {
  const actual = resolve(mode);
  const root = document.documentElement;

  // ВАЖНО: глушим все CSS-transitions на момент переключения. Иначе смена
  // data-theme разом анимирует цвет/фон тысяч элементов + body-transition с
  // background-attachment:fixed форсит дорогой re-composite всех backdrop-filter
  // на каждом кадре 300мс → главный поток фризит («экран блокируется»).
  // С глушилкой тема меняется одним мгновенным репейнтом.
  root.classList.add('theme-switching');
  root.setAttribute('data-theme', actual);
  // theme-color для PWA/мобильного статус-бара.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', actual === 'light' ? '#f4f2f7' : '#17151e');

  // Снимаем глушилку после того, как браузер применил новые переменные
  // (двойной rAF — гарантированно следующий кадр).
  if (unsuppressRaf) cancelAnimationFrame(unsuppressRaf);
  if (typeof requestAnimationFrame !== 'undefined') {
    unsuppressRaf = requestAnimationFrame(() => {
      unsuppressRaf = requestAnimationFrame(() => root.classList.remove('theme-switching'));
    });
  } else {
    root.classList.remove('theme-switching');
  }
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
