/**
 * Диалог со списком архивных чатов.
 * Fetch выполняется при открытии. После разархивации сервер пришлёт
 * 'chat:state-updated' — основной список обновится автоматически,
 * а локальную копию здесь мы фильтруем тут же чтобы строка исчезла.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArchiveRestore, Inbox } from 'lucide-react';
import type { Chat } from '@messenger/shared';
import { useAuthStore } from '@/stores/auth.store';
import { archiveChat, fetchArchivedChats } from '@/lib/chats';
import { formatMessagePreview } from '@/lib/messagePreview';
import { toast } from '@/lib/toast';
import Avatar from '@/components/ui/Avatar';
import IconBtn from '@/components/ui/IconBtn';
import { backdrop, popIn, listParent, listChild, tapSoft } from '@/lib/motion';

interface Props { open: boolean; onClose: () => void; }

export default function ArchivedChatsDialog({ open, onClose }: Props) {
  const [chats,   setChats]   = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchArchivedChats()
      .then(setChats)
      .catch(() => toast.error('Не удалось загрузить архив'))
      .finally(() => setLoading(false));
  }, [open]);

  const unarchive = async (chat: Chat) => {
    setBusyId(chat.id);
    try {
      await archiveChat(chat.id, false);
      setChats((prev) => prev.filter((c) => c.id !== chat.id));
      toast.success('Чат разархивирован');
    } catch {
      toast.error('Не удалось разархивировать');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdrop} initial="hidden" animate="visible" exit="exit"
          className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            variants={popIn} initial="hidden" animate="visible" exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative z-modal bg-dark-card border border-dark-border rounded-3xl shadow-e4 w-[28rem] max-w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border/60">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Inbox size={16} className="text-accent-violet" />
                Архив
              </h3>
              <IconBtn size="sm" onClick={onClose}><X size={16} /></IconBtn>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                // Skeleton-плейсхолдеры вместо голого спиннера.
                <ul className="space-y-1">
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="skeleton w-10 h-10 rounded-full shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="skeleton h-3.5 w-2/5 rounded-md" />
                        <div className="skeleton h-3 w-3/5 rounded-md" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 gap-4 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-brand-gradient blur-xl opacity-25 rounded-2xl" />
                    <div className="relative w-16 h-16 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center shadow-e2">
                      <Inbox size={26} className="text-primary-600 dark:text-primary-300" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-content font-semibold text-[15px]">Архив пуст</p>
                    <p className="text-content/45 text-[13px] max-w-[16rem] leading-relaxed">
                      Архивированные чаты появятся здесь и не будут мешать в основном списке.
                    </p>
                  </div>
                </div>
              ) : (
                <motion.ul
                  className="space-y-1"
                  variants={listParent} initial="hidden" animate="visible"
                >
                  <AnimatePresence initial={false}>
                    {chats.map((chat) => {
                      const other = chat.type === 'direct'
                        ? chat.members.find((m) => m.userId !== user?.id)
                        : null;
                      const name = chat.type === 'group'
                        ? chat.name
                        : other?.user.displayName ?? 'Без имени';
                      const avatar = chat.type === 'group' ? chat.avatar : other?.user.avatar;
                      const preview = formatMessagePreview(chat.lastMessage);
                      return (
                        <motion.li
                          key={chat.id}
                          layout
                          variants={listChild}
                          exit={{ opacity: 0, x: 16, height: 0, marginBottom: 0, transition: { duration: 0.2 } }}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-content/[0.045]"
                        >
                          <Avatar src={avatar} name={name ?? '?'} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate text-content/95">{name}</p>
                            <p className="text-xs text-content/45 truncate">{preview}</p>
                          </div>
                          <motion.button
                            disabled={busyId === chat.id}
                            onClick={() => unarchive(chat)}
                            whileTap={tapSoft}
                            title="Разархивировать"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-content/[0.05] hover:bg-accent-violet/15 hover:text-content text-content/70 transition-colors disabled:opacity-50"
                          >
                            <ArchiveRestore size={14} />
                            <span>Восстановить</span>
                          </motion.button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </motion.ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
