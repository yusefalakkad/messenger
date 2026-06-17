import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import Avatar from '@/components/ui/Avatar';
import { listParent, listChild, tap, SPRING } from '@/lib/motion';
import type { Chat } from '@messenger/shared';

interface Person { id: string; username: string; displayName: string; avatar?: string; }

/**
 * Мобильная вкладка «Контакты» — панель над контентом (таб-бар остаётся снизу).
 * Без запроса показывает людей, с кем уже есть личные чаты; при вводе — глобальный
 * поиск по @username. Тап открывает (или создаёт) личный чат.
 */
export default function ContactsView() {
  const navigate = useNavigate();
  const chats = useChatStore((s) => s.chats);
  const addChat = useChatStore((s) => s.addChat);
  const myId = useAuthStore((s) => s.user?.id);
  const setContactsOpen = useUIStore((s) => s.setContactsOpen);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);

  // Существующие собеседники из личных чатов — «мои контакты».
  const myContacts = useMemo<Person[]>(() => {
    return chats
      .filter((c) => c.type === 'direct')
      .map((c) => c.members.find((m) => m.userId !== myId)?.user)
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => ({ id: u.id, username: u.username ?? '', displayName: u.displayName ?? 'Без имени', avatar: u.avatar ?? undefined }));
  }, [chats, myId]);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/users/search', { params: { q } });
      setResults((data.data ?? []).filter((u: Person) => u.id !== myId));
    } finally {
      setLoading(false);
    }
  };

  const openChat = async (userId: string) => {
    const existing = chats.find((c) => c.type === 'direct' && c.members.some((m) => m.userId === userId));
    if (existing) { setContactsOpen(false); navigate(`/chat/${existing.id}`); return; }
    try {
      const { data } = await api.post('/chats/direct', { targetUserId: userId });
      const chat = data.data as Chat;
      if (!useChatStore.getState().chats.some((c) => c.id === chat.id)) addChat(chat);
      setContactsOpen(false);
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      console.error('Failed to open chat', err);
    }
  };

  const list = query.trim() ? results : myContacts;
  const showEmpty = !loading && list.length === 0;

  return (
    <div className="lg:hidden absolute inset-0 z-30 bg-dark-bg flex flex-col pt-[var(--sat)]">
      <header className="flex-shrink-0 h-14 flex items-center px-5 liquid-glass">
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">Контакты</h1>
      </header>

      <div className="px-3 py-3 flex-shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content/40" />
          <input
            autoFocus
            className="input-pill w-full"
            placeholder="Найти по имени или @username"
            value={query}
            onChange={(e) => search(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {!query.trim() && myContacts.length > 0 && (
          <p className="px-3 pb-1.5 text-[12px] font-medium text-content/40 uppercase tracking-wide">Недавние</p>
        )}

        {showEmpty ? (
          <div className="flex flex-col items-center justify-center mt-20 gap-3 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-content/[0.04] border border-dark-border flex items-center justify-center">
              <UserPlus size={24} className="text-content/45" />
            </div>
            <p className="text-content/55 text-[14px] max-w-[240px]">
              {query.trim() ? 'Никого не нашли. Проверьте @username.' : 'Начните вводить имя или @username, чтобы найти людей.'}
            </p>
          </div>
        ) : (
          <motion.div variants={listParent} initial="hidden" animate="visible">
            {list.map((p) => (
              <motion.button
                key={p.id}
                variants={listChild}
                onClick={() => openChat(p.id)}
                whileTap={tap}
                transition={SPRING.snappy}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-dark-hover/60 transition-colors"
              >
                <Avatar src={p.avatar} name={p.displayName} size="md" />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-[15px] truncate">{p.displayName}</span>
                  {p.username && <span className="block text-[13px] text-content/45 truncate">@{p.username}</span>}
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
