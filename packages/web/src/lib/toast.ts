/**
 * Минимальный toast — без зависимостей.
 * Использовать для НЕБЛОКИРУЮЩИХ уведомлений (errors, success).
 *
 * Не для модального подтверждения — для модалок используйте кастомные диалоги.
 */

type ToastKind = 'error' | 'success' | 'info';

const STYLES: Record<ToastKind, { bg: string; border: string; text: string }> = {
  error:   { bg: 'rgba(244, 63, 94, 0.16)',  border: 'rgba(244, 63, 94, 0.45)',  text: '#FFD0D7' },
  success: { bg: 'rgba(34, 197, 94, 0.16)',  border: 'rgba(34, 197, 94, 0.45)',  text: '#C2F0D2' },
  info:    { bg: 'rgba(124, 77, 255, 0.16)', border: 'rgba(124, 77, 255, 0.45)', text: '#E2D9FF' },
};

let containerEl: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (containerEl) return containerEl;
  const el = document.createElement('div');
  el.setAttribute('data-dakka-toasts', '');
  Object.assign(el.style, {
    position: 'fixed',
    top: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  containerEl = el;
  return el;
}

function show(kind: ToastKind, message: string, durationMs = 4000): void {
  const container = ensureContainer();
  const t = document.createElement('div');
  const s = STYLES[kind];
  Object.assign(t.style, {
    background: s.bg,
    border: `1px solid ${s.border}`,
    color: s.text,
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    padding: '10px 16px',
    borderRadius: '14px',
    fontSize: '13.5px',
    fontWeight: '500',
    boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
    pointerEvents: 'auto',
    opacity: '0',
    transform: 'translateY(-6px)',
    transition: 'opacity 200ms ease, transform 200ms ease',
    maxWidth: '440px',
  } as Partial<CSSStyleDeclaration>);
  t.textContent = message;
  container.appendChild(t);

  // Enter animation
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
  });

  // Exit
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      t.remove();
    }, 220);
  }, durationMs);
}

/**
 * Тост с кнопкой-действием. Не исчезает сам (для «обновить версию» и т.п.).
 * Возвращает dismiss() — закрыть программно. Повторный вызов с тем же `key`
 * не плодит дубли (заменяет предыдущий).
 */
const actionToasts = new Map<string, HTMLDivElement>();

function showAction(
  message: string,
  action: { label: string; onClick: () => void },
  opts?: { key?: string },
): () => void {
  const container = ensureContainer();
  const key = opts?.key;
  if (key) actionToasts.get(key)?.remove();

  const s = STYLES.info;
  const t = document.createElement('div');
  Object.assign(t.style, {
    display: 'flex', alignItems: 'center', gap: '12px',
    background: s.bg, border: `1px solid ${s.border}`, color: s.text,
    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
    padding: '10px 12px 10px 16px', borderRadius: '14px',
    fontSize: '13.5px', fontWeight: '500',
    boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
    pointerEvents: 'auto', opacity: '0', transform: 'translateY(-6px)',
    transition: 'opacity 200ms ease, transform 200ms ease', maxWidth: '440px',
  } as Partial<CSSStyleDeclaration>);

  const label = document.createElement('span');
  label.textContent = message;
  const btn = document.createElement('button');
  btn.textContent = action.label;
  Object.assign(btn.style, {
    flexShrink: '0', cursor: 'pointer', border: `1px solid ${s.border}`,
    background: 'rgba(124, 77, 255, 0.28)', color: '#fff', fontWeight: '600',
    fontSize: '13px', padding: '6px 12px', borderRadius: '10px',
  } as Partial<CSSStyleDeclaration>);

  const dismiss = () => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(-6px)';
    setTimeout(() => t.remove(), 220);
    if (key) actionToasts.delete(key);
  };
  btn.onclick = () => action.onClick();

  t.append(label, btn);
  container.appendChild(t);
  if (key) actionToasts.set(key, t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
  return dismiss;
}

export const toast = {
  error:   (msg: string, durationMs?: number) => show('error', msg, durationMs),
  success: (msg: string, durationMs?: number) => show('success', msg, durationMs),
  info:    (msg: string, durationMs?: number) => show('info', msg, durationMs),
  action:  showAction,
};
