import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Loader2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import Avatar from '@/components/ui/Avatar';
import type { ChatMember } from '@messenger/shared';

interface Props {
  chatId: string;
  existingMemberIds: string[];
  onClose: () => void;
}

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
}

export default function AddMemberModal({ chatId, existingMemberIds, onClose }: Props) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding,  setAdding]  = useState<string | null>(null);
  const [added,   setAdded]   = useState<Set<string>>(new Set());
  const [error,   setError]   = useState<string | null>(null);

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/users/search', { params: { q } });
      setResults((data.data ?? []).filter((u: SearchUser) => !existingMemberIds.includes(u.id)));
    } catch {
      setError('Ошибка поиска');
    } finally {
      setLoading(false);
    }
  };

  const addMember = async (userId: string) => {
    if (added.has(userId)) return;
    setAdding(userId);
    setError(null);
    try {
      await api.post<{ data: ChatMember }>(`/chats/${chatId}/members`, { userId });
      setAdded((prev) => new Set([...prev, userId]));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Не удалось добавить участника');
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-dark-card border border-dark-border rounded-2xl w-80 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <span className="font-semibold text-sm">Добавить участника</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-dark-hover flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-dark-border">
          <div className="flex items-center gap-2 bg-dark-hover rounded-xl px-3 py-2">
            <Search size={15} className="text-white/40 flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Поиск пользователей..."
              className="flex-1 bg-transparent text-sm outline-none placeholder-white/30"
            />
            {loading && <Loader2 size={14} className="text-white/40 animate-spin" />}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto">
          {error && (
            <p className="text-xs text-red-400 px-4 py-2">{error}</p>
          )}
          {results.length === 0 && query.length > 0 && !loading && (
            <p className="text-xs text-white/40 px-4 py-3 text-center">Пользователи не найдены</p>
          )}
          {results.map((user) => {
            const isAdded  = added.has(user.id);
            const isAdding = adding === user.id;
            return (
              <button
                key={user.id}
                onClick={() => addMember(user.id)}
                disabled={isAdded || isAdding}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors disabled:opacity-70"
              >
                <Avatar src={user.avatar} name={user.displayName} size="sm" />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{user.displayName}</p>
                  <p className="text-xs text-white/40 truncate">@{user.username}</p>
                </div>
                {isAdding && <Loader2 size={16} className="text-white/40 animate-spin" />}
                {isAdded  && <Check size={16} className="text-green-400" />}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
