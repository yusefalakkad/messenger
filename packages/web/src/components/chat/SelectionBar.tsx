import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, CornerUpRight, Trash2 } from 'lucide-react';
import Dialog, { DialogButton } from '@/components/ui/Dialog';
import ForwardDialog from './ForwardDialog';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { deleteMessage } from '@/lib/socket';
import { decryptMessage } from '@/lib/e2e';
import { toast } from '@/lib/toast';
import { SPRING, tap } from '@/lib/motion';

interface Props { chatId: string; }

/** Русское склонение: 1 сообщение / 2 сообщения / 5 сообщений. */
function pluralMessages(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} сообщение`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} сообщения`;
  return `${n} сообщений`;
}

/**
 * Панель мультивыбора сообщений: появляется поверх шапки чата,
 * когда в chat.store есть выбранные сообщения (selectedMessageIds).
 * Действия: копировать (только текстовые), переслать, удалить (только свои).
 */
export default function SelectionBar({ chatId }: Props) {
  const selectedIds           = useChatStore((s) => s.selectedMessageIds);
  const clearMessageSelection = useChatStore((s) => s.clearMessageSelection);
  const messages              = useChatStore((s) => s.messages[chatId]);
  const chats                 = useChatStore((s) => s.chats);
  const user                  = useAuthStore((s) => s.user);

  const [showForward,   setShowForward]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Выбранные Message-объекты (в порядке ленты — store хранит ascending).
  const selected = useMemo(
    () => (messages ?? []).filter((m) => selectedIds.includes(m.id)),
    [messages, selectedIds],
  );

  // Удалять можно только свои: если среди выбранных чужие — кнопка disabled.
  const hasForeign   = selected.some((m) => m.senderId !== user?.id);
  // Копировать — только непустые текстовые (и не удалённые).
  const textMessages = selected.filter((m) => m.type === 'text' && !!m.content && !m.deletedAt);

  const handleCopy = async () => {
    const chat = chats.find((c) => c.id === chatId);
    const { privateKey } = useAuthStore.getState();
    const parts: string[] = [];
    for (const m of textMessages) {
      let text = m.content ?? '';
      // E2E — расшифровываем как в ForwardDialog; шифротекст не копируем.
      if (m.encrypted) {
        if (!chat || !user || !privateKey) continue;
        try { text = await decryptMessage(m, chat, user.id, privateKey); }
        catch { continue; }
      }
      if (text) parts.push(text);
    }
    if (parts.length === 0) { toast.error('Нечего копировать'); return; }
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      toast.success('Скопировано');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const handleDelete = () => {
    for (const m of selected) deleteMessage(m.id, chatId);
    setConfirmDelete(false);
    clearMessageSelection();
  };

  return (
    <>
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: -72, opacity: 0 }}
            animate={{ y: 0,   opacity: 1 }}
            exit={{ y: -72, opacity: 0 }}
            transition={SPRING.smooth}
            className="absolute top-0 inset-x-0 h-16 z-panel bg-dark-surface/95 backdrop-blur-xl border-b border-dark-border shadow-e2 flex items-center gap-1 px-3"
          >
            <motion.button whileTap={tap} transition={SPRING.snappy}
              onClick={clearMessageSelection} className="btn-icon text-content/70 hover:text-content" title="Снять выделение">
              <X size={18} />
            </motion.button>
            <span className="flex-1 text-[15px] font-semibold tabular-nums pl-1">
              Выбрано: {selectedIds.length}
            </span>
            <motion.button whileTap={tap} transition={SPRING.snappy}
              onClick={() => void handleCopy()}
              disabled={textMessages.length === 0}
              className="btn-icon text-content/70 hover:text-content disabled:opacity-40 disabled:pointer-events-none"
              title={textMessages.length === 0 ? 'Нет текстовых сообщений' : 'Копировать текст'}
            >
              <Copy size={18} />
            </motion.button>
            <motion.button whileTap={tap} transition={SPRING.snappy}
              onClick={() => setShowForward(true)} className="btn-icon text-content/70 hover:text-content" title="Переслать">
              <CornerUpRight size={18} />
            </motion.button>
            <motion.button whileTap={tap} transition={SPRING.snappy}
              onClick={() => setConfirmDelete(true)}
              disabled={hasForeign}
              className="btn-icon text-rose-400 hover:bg-rose-500/15 disabled:opacity-40 disabled:pointer-events-none"
              title={hasForeign ? 'Удалять можно только свои сообщения' : 'Удалить'}
            >
              <Trash2 size={18} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {showForward && (
        <ForwardDialog messages={selected} onClose={() => setShowForward(false)} />
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Удалить ${pluralMessages(selected.length)}?`}
        description="Сообщения будут удалены для всех участников."
        footer={
          <>
            <DialogButton variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</DialogButton>
            <DialogButton variant="danger" onClick={handleDelete}>Удалить</DialogButton>
          </>
        }
      />
    </>
  );
}
