import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useFoldersStore } from '@/stores/folders.store';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import Avatar from '@/components/ui/Avatar';
import Dialog, { DialogButton } from '@/components/ui/Dialog';
import type { Chat } from '@messenger/shared';

interface Props {
  /** null — создание новой папки, id — редактирование существующей. */
  folderId: string | null;
  onClose: () => void;
}

/** Имя чата для списка: saved → «Избранное», direct → имя собеседника. */
function chatDisplay(chat: Chat, myUserId?: string): { name: string; avatar?: string | null } {
  if (chat.type === 'saved') return { name: 'Избранное' };
  if (chat.type === 'group') return { name: chat.name ?? 'Группа', avatar: chat.avatar };
  const other = chat.members.find((m) => m.userId !== myUserId);
  return { name: other?.user.displayName ?? 'Unknown', avatar: other?.user.avatar };
}

export default function FolderEditModal({ folderId, onClose }: Props) {
  const folder = useFoldersStore((s) => s.folders.find((f) => f.id === folderId) ?? null);
  const createFolder = useFoldersStore((s) => s.createFolder);
  const updateFolder = useFoldersStore((s) => s.updateFolder);
  const removeFolder = useFoldersStore((s) => s.removeFolder);
  const chats    = useChatStore((s) => s.chats);
  const myUserId = useAuthStore((s) => s.user?.id);

  const [name,  setName]  = useState(folder?.name ?? '');
  const [emoji, setEmoji] = useState(folder?.emoji ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(folder?.chatIds ?? []));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditing = folderId !== null;

  // Чаты сортируем как в Sidebar: pinned выше, дальше по последнему сообщению.
  const sortedChats = useMemo(() => [...chats].sort((a, b) => {
    const ap = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
    const bp = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
    if (ap !== bp) return bp - ap;
    const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  }), [chats]);

  const toggleChat = (chatId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  };

  const canSave = name.trim().length >= 1 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim().slice(0, 16),
        emoji: emoji.trim() || null,
        chatIds: [...selectedIds],
      };
      if (isEditing) await updateFolder(folderId, payload);
      else await createFolder(payload);
      onClose();
    } catch (err) {
      console.error('Failed to save folder', err);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!folderId) return;
    setSaving(true);
    try {
      await removeFolder(folderId);
      onClose();
    } catch (err) {
      console.error('Failed to delete folder', err);
      setSaving(false);
      setConfirmDelete(false);
    }
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
        <div className="relative flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
            <h2 className="font-semibold">{isEditing ? 'Редактировать папку' : 'Новая папка'}</h2>
            <motion.button
              whileTap={{ scale: 0.9 }}
              whileHover={{ rotate: 90 }}
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-content/[0.07] text-content/60"
            >
              <X size={18} />
            </motion.button>
          </div>

          {/* Emoji + имя */}
          <div className="flex gap-2 p-3 flex-shrink-0">
            <input
              className="input-base w-16 text-center !px-0"
              placeholder="📁"
              maxLength={2}
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
            />
            <input
              autoFocus
              className="input-base flex-1 min-w-0"
              placeholder="Название папки"
              maxLength={16}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Список чатов с чекбоксами */}
          <p className="px-4 pb-1 text-[12px] text-content/40 flex-shrink-0">
            Чаты в папке: {selectedIds.size}
          </p>
          <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2">
            {sortedChats.length === 0 && (
              <p className="text-center text-content/35 text-sm py-6">Нет чатов</p>
            )}
            {sortedChats.map((chat) => {
              const { name: chatName, avatar } = chatDisplay(chat, myUserId);
              const selected = selectedIds.has(chat.id);
              return (
                <button
                  key={chat.id}
                  onClick={() => toggleChat(chat.id)}
                  className={`list-row w-full text-left ${selected ? 'list-row-active' : ''}`}
                >
                  <Avatar src={avatar} name={chatName} size="md" />
                  <span className="flex-1 min-w-0 truncate text-[15px] text-content/90">{chatName}</span>
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition ${
                    selected ? 'bg-brand-gradient border-transparent' : 'border-content/20'
                  }`}>
                    {selected && <Check size={13} className="text-white" />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Кнопки */}
          <div className="flex gap-2 p-3 border-t border-dark-border flex-shrink-0">
            {isEditing && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="btn-danger btn-sm"
              >
                Удалить
              </button>
            )}
            <div className="flex-1" />
            <button onClick={onClose} className="btn-ghost btn-sm">Отмена</button>
            <button onClick={handleSave} disabled={!canSave} className="btn-primary btn-sm">
              Сохранить
            </button>
          </div>
        </div>
      </motion.div>

      {/* Подтверждение удаления папки (чаты не удаляются) */}
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Удалить папку?"
        description={`Папка «${folder?.name ?? name}» будет удалена. Чаты останутся на месте.`}
        footer={
          <>
            <DialogButton variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</DialogButton>
            <DialogButton variant="danger" onClick={handleDelete} disabled={saving}>Удалить</DialogButton>
          </>
        }
      />
    </motion.div>
  );
}
