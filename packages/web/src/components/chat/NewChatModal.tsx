import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chat.store';
import Avatar from '@/components/ui/Avatar';
import { backdrop, popIn, listParent, listChild, tap, SPRING } from '@/lib/motion';
import type { Chat } from '@messenger/shared';

interface Props { onClose: () => void; }

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
}

export default function NewChatModal({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const addChat = useChatStore((s) => s.addChat);

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/users/search', { params: { q } });
      setResults(data.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (userId: string) => {
    const { data } = await api.post('/chats/direct', { targetUserId: userId });
    const chat = data.data as Chat;
    addChat(chat);
    navigate(`/chat/${chat.id}`);
    onClose();
  };

  return (
    // Подложка — z-overlay
    <motion.div
      variants={backdrop}
      initial="hidden" animate="visible" exit="exit"
      className="fixed inset-0 z-overlay flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Карточка — z-modal */}
      <motion.div
        variants={popIn}
        initial="hidden" animate="visible" exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="relative z-modal glass-card rounded-2xl shadow-e3 w-full max-w-sm overflow-hidden"
      >
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-spot-violet blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
            <h3 className="font-semibold">Новый чат</h3>
            <motion.button
              whileTap={tap}
              transition={SPRING.snappy}
              onClick={onClose}
              className="btn-icon btn-icon-sm"
              aria-label="Закрыть"
            >
              <X size={16} />
            </motion.button>
          </div>

          <div className="p-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-content/30 z-raised" />
              <input
                autoFocus
                className="input-pill w-full"
                placeholder="Поиск пользователей..."
                value={query}
                onChange={(e) => search(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto px-2 pb-2">
            {loading && (
              // Skeleton вместо голого спиннера
              <div className="space-y-1 px-2 py-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                    <div className="skeleton w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-3 w-32 rounded" />
                      <div className="skeleton h-2.5 w-20 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && (
              <motion.div variants={listParent} initial="hidden" animate="visible">
                {results.map((u) => (
                  <motion.button
                    key={u.id}
                    variants={listChild}
                    onClick={() => startChat(u.id)}
                    className="list-item w-full text-left"
                  >
                    <Avatar src={u.avatar} name={u.displayName} size="md" />
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium truncate">{u.displayName}</p>
                      <p className="text-[12px] text-content/45 truncate">@{u.username}</p>
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            )}
            {!loading && query.length > 0 && results.length === 0 && (
              // Пустое состояние с brand-glow иконкой
              <div className="flex flex-col items-center text-center px-6 py-8">
                <div className="w-14 h-14 rounded-2xl bg-brand-gradient-soft border border-dark-border shadow-glow-violet flex items-center justify-center mb-3">
                  <Users size={24} className="text-white/55" />
                </div>
                <p className="text-[15px] font-medium">Никого не нашлось</p>
                <p className="text-[13px] text-content/45 mt-1">Попробуйте другое имя или @username</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
