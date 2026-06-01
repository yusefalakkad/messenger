import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import Avatar from '@/components/ui/Avatar';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';

interface Props {
  chatId: string;
  query: string;                            // строка после @, e.g. "ali"
  onSelect: (username: string) => void;     // вставить @username
  onClose: () => void;
}

export default function MentionAutocomplete({ chatId, query, onSelect, onClose }: Props) {
  const myId = useAuthStore((s) => s.user?.id);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const members = (chat?.members ?? [])
    .filter((m) => m.userId !== myId)
    .map((m) => m.user)
    .filter((u) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
    })
    .slice(0, 6);

  useEffect(() => { setActive(0); }, [query]);

  // Глобальные клавиши: стрелки + Enter + Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (members.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % members.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + members.length) % members.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSelect(members[active].username);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [members, active, onSelect, onClose]);

  if (members.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.12 }}
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 mx-2 bg-dark-card border border-dark-border/80 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-20"
    >
      <div className="px-3 py-1.5 border-b border-dark-border/40 text-[10px] uppercase tracking-wide text-white/30 font-semibold">
        Упомянуть
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {members.map((u, i) => (
          <button
            key={u.id}
            onMouseEnter={() => setActive(i)}
            onClick={() => onSelect(u.username)}
            className={clsx(
              'w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left',
              i === active ? 'bg-dark-hover' : 'hover:bg-dark-hover/60',
            )}
          >
            <Avatar src={u.avatar} name={u.displayName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">{u.displayName}</p>
              <p className="text-xs text-white/40 truncate mt-0.5">@{u.username}</p>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
