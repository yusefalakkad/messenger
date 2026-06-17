/**
 * Авто-детект новой версии фронта + тост «Обновить».
 *
 * Зачем: index.html ссылается на хешированные ассеты (/assets/index-<hash>.js).
 * После деплоя хеши меняются. nginx отдаёт index.html с `no-cache`, но открытая
 * вкладка живёт со старым бандлом, пока её не перезагрузят. Этот модуль периодически
 * перечитывает index.html и, если набор хешей изменился, показывает не-исчезающий
 * тост с кнопкой «Обновить» → location.reload().
 *
 * Сигнатура версии = отсортированный список ссылок на /assets/ из index.html.
 * Baseline снимаем при старте (та версия, что отдала текущую страницу), дальше
 * сравниваем с ней — без завязки на DOM (ленивые чанки в DOM ещё не попали).
 */
import { toast } from './toast';

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // каждые 2 минуты в фоне

/** Достаём отсортированный список /assets/*.js|css из HTML-строки. */
function signatureFromHtml(html: string): string {
  const matches = html.match(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g) || [];
  return [...new Set(matches)].sort().join('|');
}

async function fetchSignature(): Promise<string | null> {
  try {
    const res = await fetch('/index.html', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const sig = signatureFromHtml(await res.text());
    return sig || null; // пустая сигнатура (dev / нет /assets/) — не сравниваем
  } catch {
    return null; // оффлайн/сеть — молча пропускаем, попробуем в следующий раз
  }
}

export function initAppUpdateCheck(): void {
  // Только продакшен-веб. В dev ассеты не хешируются; в Electron/Capacitor фронт
  // зашит в сборку и обновляется переустановкой, не перезагрузкой вкладки.
  const env = (import.meta as { env?: { PROD?: boolean } }).env;
  if (!env?.PROD) return;
  const w = window as { dakkaDesktop?: { isDesktop?: boolean }; Capacitor?: unknown };
  if (w.dakkaDesktop?.isDesktop || w.Capacitor) return;

  let baseline: string | null = null;
  let notified = false;

  const check = async () => {
    if (notified || document.hidden) return;
    const sig = await fetchSignature();
    if (!sig) return;
    if (baseline === null) { baseline = sig; return; } // первый замер — эталон
    if (sig === baseline) return;

    notified = true;
    toast.action(
      'Доступна новая версия Dakka',
      { label: 'Обновить', onClick: () => window.location.reload() },
      { key: 'app-update' },
    );
  };

  // Эталон снимаем сразу, дальше — по таймеру и при возврате на вкладку.
  void check();
  setInterval(() => void check(), CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
}
