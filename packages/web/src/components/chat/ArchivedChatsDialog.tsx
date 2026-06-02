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
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-card border border-dark-border rounded-3xl shadow-2xl shadow-black/60 w-[28rem] max-h-[80vh] flex flex-col overflow-hidden"
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
                <div className="text-center text-white/40 text-sm py-10">Загрузка…</div>
              ) : chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-6 gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                    <Inbox size={20} className="text-white/40" />
                  </div>
                  <p className="text-white/50 text-sm">Архив пуст</p>
                </div>
              ) : (
                <ul className="space-y-1">
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
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16, height: 0, marginBottom: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.045]"
                        >
                          <Avatar src={avatar} name={name ?? '?'} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate text-white/95">{name}</p>
                            <p className="text-xs text-white/45 truncate">{preview}</p>
                          </div>
                          <button
                            disabled={busyId === chat.id}
                            onClick={() => unarchive(chat)}
                            title="Разархивировать"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/[0.05] hover:bg-accent-violet/15 hover:text-white text-white/70 transition-colors disabled:opacity-50"
                          >
                            <ArchiveRestore size={14} />
                            <span>Восстановить</span>
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
