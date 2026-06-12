import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import Avatar from '@/components/ui/Avatar';
import type { Message } from '@messenger/shared';

interface Props { chatId: string; onClose: () => void; }

export default function ChatSearch({ chatId, onClose }: Props) {
  const [q,        setQ]        = useState('');
  const [results,  setResults]  = useState<Message[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setResults([]); return; }

    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/chats/${chatId}/messages/search`, { params: { q: t } });
        setResults(data.data ?? []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);

    return () => clearTimeout(handle);
  }, [q, chatId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.12 }}
      className="absolute top-0 left-0 right-0 z-30 bg-dark-surface border-b border-dark-border/60 shadow-2xl shadow-black/40"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border/40">
        <Search size={16} className="text-content/40 flex-shrink-0" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Поиск сообщений..."
          className="flex-1 bg-transparent outline-none text-sm placeholder-content/30 text-content"
        />
        {loading && <Loader2 size={14} className="text-content/40 animate-spin" />}
        <button onClick={onClose} className="btn-icon btn-icon-sm">
          <X size={16} />
        </button>
      </div>

      {q.trim().length >= 2 && (
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-sm text-content/40">
              Ничего не найдено
            </div>
          )}
          {results.map((m) => (
            <div key={m.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-dark-hover transition-colors border-b border-dark-border/30">
              <Avatar src={m.sender?.avatar} name={m.sender?.displayName ?? '?'} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-primary-400 font-medium">{m.sender?.displayName}</p>
                <p className="text-sm text-content/80 truncate">{highlight(m.content ?? '', q)}</p>
              </div>
              <span className="text-xs text-content/30 flex-shrink-0">
                {new Date(m.createdAt).toLocaleDateString('ru', { day: '2-digit', month: 'short' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function highlight(text: string, q: string) {
  const t = q.trim();
  if (!t) return text;
  const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  const parts = text.split(re);
  return parts.map((p, i) => re.test(p) ? <mark key={i} className="bg-primary-500/30 text-white rounded px-0.5">{p}</mark> : p);
}
