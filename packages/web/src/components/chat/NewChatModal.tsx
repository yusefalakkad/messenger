import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chat.store';
import Avatar from '@/components/ui/Avatar';
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-sm overflow-hidden relative"
      >
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-spot-violet blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <h2 className="font-semibold">Новый чат</h2>
            <motion.button
              whileTap={{ scale: 0.9 }}
              whileHover={{ rotate: 90 }}
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.07] text-white/60"
            >
              <X size={18} />
            </motion.button>
          </div>

          <div className="p-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                autoFocus
                className="input-pill w-full !pl-9"
                placeholder="Поиск пользователей..."
                value={query}
                onChange={(e) => search(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto pb-2">
            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 size={20} className="animate-spin text-primary-300" />
              </div>
            )}
            {!loading && results.map((u, idx) => (
              <motion.button
                key={u.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                whileHover={{ x: 2 }}
                onClick={() => startChat(u.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.05]"
              >
                <Avatar src={u.avatar} name={u.displayName} size="md" />
                <div className="text-left">
                  <p className="text-sm font-medium">{u.displayName}</p>
                  <p className="text-xs text-white/40">@{u.username}</p>
                </div>
              </motion.button>
            ))}
            {!loading && query.length > 0 && results.length === 0 && (
              <p className="text-center text-white/35 text-sm py-6">Пользователи не найдены</p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
