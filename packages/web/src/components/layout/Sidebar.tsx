import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Plus, LogOut, Users, MessageSquarePlus, Camera, Settings, Archive, Bookmark, Megaphone } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useChatStore } from '@/stores/chat.store';
import { useFoldersStore } from '@/stores/folders.store';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import Avatar from '@/components/ui/Avatar';
import IconBtn from '@/components/ui/IconBtn';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import ChatListItem from '@/components/chat/ChatListItem';
import NewChatModal from '@/components/chat/NewChatModal';
import NewGroupModal from '@/components/chat/NewGroupModal';
import NewChannelModal from '@/components/chat/NewChannelModal';
import SettingsDialog from '@/components/settings/SettingsDialog';
import ArchivedChatsDialog from '@/components/chat/ArchivedChatsDialog';
import GlobalSearchOverlay from '@/components/chat/GlobalSearchOverlay';
import FolderTabs from '@/components/layout/FolderTabs';
import FolderEditModal from '@/components/layout/FolderEditModal';
import GroupCallPill from '@/components/call/GroupCallPill';
import type { Chat } from '@messenger/shared';

export default function Sidebar() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const chats = useChatStore((s) => s.chats);
  const addChat = useChatStore((s) => s.addChat);
  const user  = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout  = useAuthStore((s) => s.logout);

  const [search,      setSearch]      = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showPlus,    setShowPlus]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArchive,  setShowArchive]  = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Редактирование папки: open + id (null = создание новой)
  const [editFolder, setEditFolder] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const folders        = useFoldersStore((s) => s.folders);
  const activeFolderId = useFoldersStore((s) => s.activeFolderId);
  const loadFolders    = useFoldersStore((s) => s.loadFolders);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) ?? null : null;

  // В основном списке прячем архивные (даже если socket прислал archivedAt после загрузки).
  // На табе-папке показываем только чаты из folder.chatIds.
  // Дополнительно сортируем по pinnedAt DESC, затем по lastMessage — на случай
  // если socket принёс новое закрепление, а порядок ещё не обновился с сервера.
  const visibleChats = [...chats]
    .filter((c) => !c.archivedAt)
    .filter((c) => !activeFolder || activeFolder.chatIds.includes(c.id))
    .sort((a, b) => {
      const ap = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
      const bp = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
      if (ap !== bp) return bp - ap;
      const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });

  const archivedCount = chats.filter((c) => !!c.archivedAt).length;

  const filtered = visibleChats.filter((c) => {
    if (!search) return true;
    const name = c.type === 'saved'
      ? 'избранное'
      : c.type === 'group' || c.type === 'channel'
        ? c.name
        : c.members.find((m) => m.userId !== user?.id)?.user.displayName;
    return name?.toLowerCase().includes(search.toLowerCase());
  });

  // Глобальный поиск активен от 2 символов — оверлей поверх списка чатов
  const showGlobalSearch = search.trim().length >= 2;

  // ── Избранное (saved messages) ──────────────────────────────────────────────
  const openSaved = async () => {
    // Если saved-чат уже загружен — просто переходим
    const existing = chats.find((c) => c.type === 'saved');
    if (existing) {
      navigate(`/chat/${existing.id}`);
      return;
    }
    try {
      const { data } = await api.post('/chats/saved');
      const chat = data.data as Chat;
      if (!useChatStore.getState().chats.some((c) => c.id === chat.id)) addChat(chat);
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      console.error('Failed to open saved messages', err);
    }
  };

  const handleLogout = async () => {
    await api.post('/auth/logout').catch(() => {});
    disconnectSocket();
    logout();
    navigate('/auth');
  };

  // ── Загрузка аватара ─────────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/users/me/avatar', form);
      const newAvatarUrl: string = data.data.url;
      // Обновляем стор
      const { accessToken, privateKey } = useAuthStore.getState();
      setAuth({ ...user, avatar: newAvatarUrl }, accessToken ?? '', privateKey ?? undefined);
    } catch (err) {
      console.error('Avatar upload failed', err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <aside className="w-full lg:w-80 h-full flex flex-col border-r border-dark-border bg-dark-surface/80 backdrop-blur-xl relative pt-[var(--sat)]">
      {/* Ambient свечение в шапке сайдбара */}
      <div className="absolute -top-20 -left-10 w-64 h-64 bg-spot-violet blur-3xl opacity-40 pointer-events-none" />

      {/* ── Header (h=64px = 4+44+16 паддинги, hit-target ≥44px) ── */}
      <div className="relative flex items-center gap-3 px-4 h-16 border-b border-dark-border flex-shrink-0">

        {/* Аватар в градиентном кольце с возможностью смены */}
        <div className="relative flex-shrink-0 group">
          <div className="ring-gradient">
            <div className="rounded-full bg-dark-surface p-[2px]">
              <Avatar
                src={user?.avatar}
                name={user?.displayName ?? '?'}
                size="md"
                online
              />
            </div>
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute inset-1 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            title="Сменить фото"
          >
            {uploadingAvatar
              ? <div className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
              : <Camera size={14} className="text-white" />
            }
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate leading-tight">{user?.displayName}</p>
          <p className="text-white/45 text-[12px] truncate mt-0.5">@{user?.username}</p>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative">
            <IconBtn onClick={() => setShowPlus((v) => !v)} active={showPlus} title="Новый чат или группа">
              <Plus size={18} />
            </IconBtn>
            <Dropdown open={showPlus} onClose={() => setShowPlus(false)}>
              <DropdownItem
                icon={<MessageSquarePlus size={16} />} label="Новый чат"
                onClick={() => { setShowNewChat(true); setShowPlus(false); }}
              />
              <DropdownItem
                icon={<Users size={16} />} label="Новая группа"
                onClick={() => { setShowNewGroup(true); setShowPlus(false); }}
              />
              <DropdownItem
                icon={<Megaphone size={16} />} label="Новый канал"
                onClick={() => { setShowNewChannel(true); setShowPlus(false); }}
              />
            </Dropdown>
          </div>

          <IconBtn onClick={() => setShowSettings(true)} title="Настройки">
            <Settings size={18} />
          </IconBtn>

          <IconBtn onClick={handleLogout} title="Выйти">
            <LogOut size={18} />
          </IconBtn>
        </div>
      </div>

      {/* ── In-call pill (LiveKit групповой звонок, виден только в активном звонке) ── */}
      <GroupCallPill />

      {/* ── Search (44px hit-target — на 8 пиксельных стопов выровнен) ── */}
      <div className="px-4 py-3 flex-shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            className="input-pill w-full"
            placeholder="Поиск чатов..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Folder tabs — «Все» + папки + «+» ── */}
      <FolderTabs onEditFolder={(id) => setEditFolder({ open: true, id })} />

      {/* ── Archive entry — list-item стиля (h=48px компактный), только на табе «Все» ── */}
      {!activeFolderId && (
      <button
        onClick={() => setShowArchive(true)}
        className="mx-2 mb-2 flex items-center gap-3 px-3 h-12 rounded-md text-left text-[14px] hover:bg-white/[0.04] active:bg-white/[0.06] transition group flex-shrink-0"
        title="Архивные чаты"
      >
        <span className="w-9 h-9 rounded-md bg-accent-violet/15 flex items-center justify-center text-accent-violet group-hover:scale-105 transition-transform">
          <Archive size={16} />
        </span>
        <span className="flex-1 text-white/85 font-medium">Архив</span>
        {archivedCount > 0 && (
          <span className="text-[12px] font-medium text-white/50 px-2">{archivedCount}</span>
        )}
      </button>
      )}

      {/* ── Saved messages entry — «Избранное», только на табе «Все» ── */}
      {!activeFolderId && (
      <button
        onClick={openSaved}
        className="mx-2 mb-2 flex items-center gap-3 px-3 h-12 rounded-md text-left text-[14px] hover:bg-white/[0.04] active:bg-white/[0.06] transition group flex-shrink-0"
        title="Избранное"
      >
        <span className="w-9 h-9 rounded-md bg-primary-500/15 flex items-center justify-center text-primary-400 group-hover:scale-105 transition-transform">
          <Bookmark size={16} />
        </span>
        <span className="flex-1 text-white/85 font-medium">Избранное</span>
      </button>
      )}

      {/* ── Chat list ── */}
      <div className="relative flex-1 overflow-y-auto px-1">
        {/* Глобальный поиск поверх списка — локальную фильтрацию не показываем */}
        <AnimatePresence>
          {showGlobalSearch && (
            <GlobalSearchOverlay
              query={search}
              onOpenChat={(id, messageId) => {
                navigate(`/chat/${id}`);
                setSearch('');
                // Прыжок после маунта MessageList и загрузки чата
                if (messageId) setTimeout(() => useChatStore.getState().requestJump(id, messageId), 300);
              }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showGlobalSearch ? null : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center mt-12 px-6 gap-3 text-center">
              <div className="relative">
                <div className="absolute inset-0 bg-brand-gradient blur-xl opacity-30 rounded-2xl" />
                <div className="relative w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                  <Users size={24} className="text-white/40" />
                </div>
              </div>
              <p className="text-white/50 text-sm">Здесь пока тихо</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="text-xs font-medium text-gradient hover:opacity-80 transition-opacity"
              >
                Начать переписку →
              </button>
            </div>
          ) : (
            filtered.map((chat, idx) => (
              <motion.div
                key={chat.id}
                layout="position"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24, height: 0 }}
                transition={{ delay: Math.min(idx * 0.04, 0.3), duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              >
                <ChatListItem
                  chat={chat}
                  active={chat.id === chatId}
                  onClick={() => navigate(`/chat/${chat.id}`)}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showNewChat  && <NewChatModal  onClose={() => setShowNewChat(false)} />}
        {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
        {showNewChannel && <NewChannelModal onClose={() => setShowNewChannel(false)} />}
        {editFolder.open && (
          <FolderEditModal
            folderId={editFolder.id}
            onClose={() => setEditFolder({ open: false, id: null })}
          />
        )}
      </AnimatePresence>

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <ArchivedChatsDialog open={showArchive} onClose={() => setShowArchive(false)} />
    </aside>
  );
}
