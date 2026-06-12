/**
 * Бар закреплённых сообщений над лентой чата.
 * Данные: GET /chats/:id/pinned при маунте + live-склейка с сообщениями
 * из chat-store (pinnedAt меняется через 'message:pinned').
 * Клик — циклично переключает на следующий pinned + onJump к нему.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pin, X } from 'lucide-react';
import type { Message } from '@messenger/shared';
import { api } from '@/lib/api';
import { pinMessage } from '@/lib/socket';
import { useChatStore } from '@/stores/chat.store';
import { formatMessagePreview } from '@/lib/messagePreview';

interface Props {
  chatId: string;
  onJump?: (messageId: string) => void;
}

const ts = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : 0);

export default function PinnedMessagesBar({ chatId, onJump }: Props) {
  const [pinned, setPinned] = useState<Message[]>([]);
  const [index, setIndex] = useState(0);
  const storeMessages = useChatStore((s) => s.messages[chatId]);

  // Начальная загрузка списка закреплённых
  useEffect(() => {
    let cancelled = false;
    setPinned([]);
    setIndex(0);
    api
      .get(`/chats/${chatId}/pinned`)
      .then(({ data }) => {
        if (!cancelled) setPinned(data.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // Live-склейка: store-сообщения этого чата перекрывают серверный список.
  // pinnedAt появился → добавить/обновить; снят или сообщение удалено → убрать.
  useEffect(() => {
    if (!storeMessages) return;
    setPinned((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      let changed = false;
      for (const m of storeMessages) {
        const isPinned = m.pinnedAt != null && !m.deletedAt;
        const existing = byId.get(m.id);
        if (isPinned && existing !== m) {
          byId.set(m.id, m);
          changed = true;
        } else if (!isPinned && existing) {
          byId.delete(m.id);
          changed = true;
        }
      }
      if (!changed) return prev;
      // Как на сервере: свежезакреплённые первыми
      return [...byId.values()].sort((a, b) => ts(b.pinnedAt) - ts(a.pinnedAt));
    });
  }, [storeMessages]);

  const safeIndex = pinned.length > 0 ? Math.min(index, pinned.length - 1) : 0;
  const current = pinned[safeIndex];

  // Клик — jump к текущему, затем циклично к следующему
  const handleClick = () => {
    if (!current) return;
    onJump?.(current.id);
    setIndex((safeIndex + 1) % pinned.length);
  };

  const handleUnpin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!current) return;
    pinMessage(chatId, current.id, false);
    // Оптимистично убираем — событие 'message:pinned' догонит store
    setPinned((prev) => prev.filter((m) => m.id !== current.id));
  };

  return (
    <AnimatePresence initial={false}>
      {current && (
        <motion.div
          key="pinned-bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 48, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="overflow-hidden flex-shrink-0 bg-dark-surface/80 backdrop-blur border-b border-dark-border"
        >
          <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
            className="h-12 px-4 flex items-center gap-3 cursor-pointer hover:bg-white/[0.03] transition"
          >
            <Pin size={16} className="text-primary-400 rotate-45 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <span className="text-[12px] leading-4 text-primary-300 tabular-nums">
                Закреплённое сообщение {safeIndex + 1} из {pinned.length}
              </span>
              <span className="text-[13px] leading-4 text-white/80 truncate">
                {formatMessagePreview(current)}
              </span>
            </div>
            <button
              onClick={handleUnpin}
              className="btn-icon btn-icon-sm flex-shrink-0"
              aria-label="Открепить сообщение"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
