import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useFoldersStore } from '@/stores/folders.store';
import { useChatStore } from '@/stores/chat.store';
import type { ChatFolder } from '@messenger/shared';

interface Props {
  /** null — создание новой папки («+»), id — редактирование существующей. */
  onEditFolder: (id: string | null) => void;
}

const LONG_PRESS_MS = 450;

/** Один таб папки: клик — активация, правый клик/long-press — редактирование. */
function FolderTab({
  folder, active, unread, onSelect, onEdit,
}: {
  folder: ChatFolder | null; // null = таб «Все»
  active: boolean;
  unread: number;
  onSelect: () => void;
  onEdit?: () => void;
}) {
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  const handleTouchStart = () => {
    if (!onEdit) return;
    longPressTriggered.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      if (navigator.vibrate) navigator.vibrate(15);
      onEdit();
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = () => {
    // Если только что сработал long-press — клик игнорируем (как в ChatListItem).
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    onSelect();
  };

  return (
    <button
      onClick={handleClick}
      onContextMenu={onEdit ? (e) => { e.preventDefault(); onEdit(); } : undefined}
      onTouchStart={handleTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
      className={`relative flex-shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium transition ${
        active ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:text-white/80 hover:bg-white/[0.04]'
      }`}
    >
      {folder?.emoji && <span className="text-[14px] leading-none">{folder.emoji}</span>}
      <span className="whitespace-nowrap">{folder ? folder.name : 'Все'}</span>
      {unread > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-gradient text-white text-[11px] font-semibold leading-[18px] text-center tabular-nums">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      {active && (
        <motion.span
          layoutId="folder-tab-indicator"
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          className="absolute left-3 right-3 -bottom-1 h-0.5 rounded-full bg-brand-gradient"
        />
      )}
    </button>
  );
}

/**
 * Горизонтальная лента табов папок под поиском в Sidebar:
 * «Все» + пользовательские папки (emoji + имя + бейдж непрочитанных) + «+».
 */
export default function FolderTabs({ onEditFolder }: Props) {
  const folders        = useFoldersStore((s) => s.folders);
  const activeFolderId = useFoldersStore((s) => s.activeFolderId);
  const setActiveFolder = useFoldersStore((s) => s.setActiveFolder);
  const loadFolders     = useFoldersStore((s) => s.loadFolders);
  const chats = useChatStore((s) => s.chats);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  // Сумма unreadCount чатов, входящих в папку.
  const unreadIn = (folder: ChatFolder) => {
    const ids = new Set(folder.chatIds);
    return chats.reduce((sum, c) => (ids.has(c.id) ? sum + (c.unreadCount ?? 0) : sum), 0);
  };

  return (
    <div className="px-2 pb-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide flex-shrink-0">
      <FolderTab
        folder={null}
        active={activeFolderId === null}
        unread={0}
        onSelect={() => setActiveFolder(null)}
      />
      {folders.map((f) => (
        <FolderTab
          key={f.id}
          folder={f}
          active={activeFolderId === f.id}
          unread={unreadIn(f)}
          onSelect={() => setActiveFolder(f.id)}
          onEdit={() => onEditFolder(f.id)}
        />
      ))}
      <button
        onClick={() => onEditFolder(null)}
        title="Новая папка"
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-white/55 hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
