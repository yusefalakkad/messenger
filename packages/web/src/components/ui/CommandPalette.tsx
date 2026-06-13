/**
 * Командная палитра (⌘K / Ctrl+K) — как в Linear/Slack/Telegram.
 * Мгновенный переход в любой чат + быстрые действия (тема). Навигация
 * стрелками, Enter — выбрать, Esc — закрыть. Глобальный хоткей внутри компонента.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Moon, Sun, Monitor, MessageSquare, Bookmark, Megaphone, Users, CornerDownLeft } from 'lucide-react';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { setMode } from '@/lib/theme';
import { backdrop, popIn } from '@/lib/motion';
import Avatar from '@/components/ui/Avatar';

type Item =
  | { kind: 'action'; id: string; label: string; icon: JSX.Element; run: () => void }
  | { kind: 'chat'; id: string; label: string; sub?: string; avatar?: string | null; chatType: string; run: () => void };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const chats = useChatStore((s) => s.chats);
  const myId  = useAuthStore((s) => s.user?.id);

  const close = useCallback(() => { setOpen(false); setQuery(''); setSel(0); }, []);

  // Глобальный хоткей ⌘K / Ctrl+K (и Esc на закрытие).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  const chatName = useCallback((c: typeof chats[number]): { name: string; sub?: string } => {
    if (c.type === 'saved') return { name: 'Избранное' };
    if (c.type === 'group') return { name: c.name ?? 'Группа', sub: `${c.members.length} участников` };
    if (c.type === 'channel') return { name: c.name ?? 'Канал', sub: 'канал' };
    const other = c.members.find((m) => m.userId !== myId);
    return { name: other?.user.displayName ?? other?.user.username ?? 'Чат', sub: other?.user.username ? `@${other.user.username}` : undefined };
  }, [myId]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    // Действия (фильтруются по запросу).
    const actions: Item[] = ([
      { kind: 'action', id: 'theme-dark',  label: 'Тёмная тема',  icon: <Moon size={16} />,    run: () => setMode('dark') },
      { kind: 'action', id: 'theme-light', label: 'Светлая тема', icon: <Sun size={16} />,     run: () => setMode('light') },
      { kind: 'action', id: 'theme-auto',  label: 'Тема: авто',   icon: <Monitor size={16} />, run: () => setMode('auto') },
    ] as Item[]).filter((a) => !q || a.label.toLowerCase().includes(q));

    // Чаты (фильтруются по имени/нику).
    const chatItems: Item[] = chats
      .filter((c) => !c.archivedAt)
      .map((c) => {
        const { name, sub } = chatName(c);
        return { c, name, sub };
      })
      .filter(({ name, sub }) => !q || name.toLowerCase().includes(q) || (sub ?? '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(({ c, name, sub }) => ({
        kind: 'chat' as const, id: c.id, label: name, sub,
        avatar: c.type === 'group' || c.type === 'channel' ? c.avatar : c.members.find((m) => m.userId !== myId)?.user.avatar,
        chatType: c.type,
        run: () => navigate(`/chat/${c.id}`),
      }));

    return [...chatItems, ...actions];
  }, [query, chats, chatName, myId, navigate]);

  useEffect(() => { setSel(0); }, [query]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[sel]; if (it) { it.run(); close(); } }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdrop} initial="hidden" animate="visible" exit="exit"
          onClick={close}
          className="fixed inset-0 z-modal flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            variants={popIn} initial="hidden" animate="visible" exit="exit"
            onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="Командная палитра"
            className="w-full max-w-lg glass-card rounded-2xl shadow-e4 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-dark-border">
              <Search size={18} className="text-content/40 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKey}
                placeholder="Перейти в чат или действие…"
                className="flex-1 bg-transparent text-content placeholder-content/35 outline-none text-[15px]"
              />
              <kbd className="text-[11px] text-content/40 border border-dark-border rounded px-1.5 py-0.5">esc</kbd>
            </div>

            <div className="max-h-[55vh] overflow-y-auto py-2">
              {items.length === 0 ? (
                <p className="text-center text-content/45 text-[14px] py-8">Ничего не найдено</p>
              ) : (
                items.map((it, i) => (
                  <button
                    key={`${it.kind}-${it.id}`}
                    onClick={() => { it.run(); close(); }}
                    onMouseEnter={() => setSel(i)}
                    className={`w-full flex items-center gap-3 px-3 h-12 mx-2 rounded-lg text-left transition-colors ${
                      sel === i ? 'bg-brand-gradient-soft' : 'hover:bg-content/[0.04]'
                    }`}
                    style={{ width: 'calc(100% - 1rem)' }}
                  >
                    {it.kind === 'chat' ? (
                      it.chatType === 'saved' ? (
                        <span className="w-8 h-8 rounded-full bg-brand-gradient flex items-center justify-center flex-shrink-0"><Bookmark size={15} className="text-white" /></span>
                      ) : (
                        <Avatar src={it.avatar} name={it.label} size="sm" />
                      )
                    ) : (
                      <span className="w-8 h-8 rounded-lg bg-content/[0.06] flex items-center justify-center flex-shrink-0 text-content/70">{it.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium truncate flex items-center gap-1.5">
                        {it.kind === 'chat' && it.chatType === 'channel' && <Megaphone size={12} className="text-content/45" />}
                        {it.kind === 'chat' && it.chatType === 'group' && <Users size={12} className="text-content/45" />}
                        {it.label}
                      </p>
                      {it.kind === 'chat' && it.sub && <p className="text-[12px] text-content/45 truncate">{it.sub}</p>}
                      {it.kind === 'action' && <p className="text-[12px] text-content/45">действие</p>}
                    </div>
                    {sel === i && <CornerDownLeft size={14} className="text-content/40 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center gap-3 px-4 h-9 border-t border-dark-border text-[11px] text-content/40">
              <span className="flex items-center gap-1"><MessageSquare size={12} /> переход в чат</span>
              <span className="ml-auto flex items-center gap-1">↑↓ выбор · ↵ открыть</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
