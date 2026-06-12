import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import Avatar from '@/components/ui/Avatar';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { menu } from '@/lib/motion';

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
      variants={menu}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ transformOrigin: 'bottom center' }}
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 mx-2 surface-2 rounded-2xl shadow-e3 overflow-hidden z-dropdown"
    >
      {/* Заголовок секции — uppercase-метка */}
      <div className="px-3 py-2 border-b border-dark-border text-[11px] uppercase tracking-wider text-content/45 font-semibold">
        Упомянуть
      </div>
      <div className="max-h-64 overflow-y-auto p-1.5">
        {members.map((u, i) => (
          <button
            key={u.id}
            onMouseEnter={() => setActive(i)}
            onClick={() => onSelect(u.username)}
            className={clsx(
              'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors duration-150 text-left',
              i === active ? 'bg-content/[0.07]' : 'hover:bg-content/[0.04]',
            )}
          >
            <Avatar src={u.avatar} name={u.displayName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium truncate leading-tight">{u.displayName}</p>
              <p className="text-[13px] text-content/45 truncate mt-0.5">@{u.username}</p>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
