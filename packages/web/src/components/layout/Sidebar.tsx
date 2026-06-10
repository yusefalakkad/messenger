import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Plus, LogOut, Users, MessageSquarePlus, Camera, Settings, Archive } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import Avatar from '@/components/ui/Avatar';
import IconBtn from '@/components/ui/IconBtn';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import ChatListItem from '@/components/chat/ChatListItem';
import NewChatModal from '@/components/chat/NewChatModal';
import NewGroupModal from '@/components/chat/NewGroupModal';
import SettingsDialog from '@/components/settings/SettingsDialog';
import ArchivedChatsDialog from '@/components/chat/ArchivedChatsDialog';
import GroupCallPill from '@/components/call/GroupCallPill';

export default function Sidebar() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const chats = useChatStore((s) => s.chats);
  const user  = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout  = useAuthStore((s) => s.logout);

  const [search,      setSearch]      = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showPlus,    setShowPlus]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArchive,  setShowArchive]  = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // В основном списке прячем архивные (даже если socket прислал archivedAt после загрузки).
  // Дополнительно сортируем по pinnedAt DESC, затем по lastMessage — на случай
  // если socket принёс новое закрепление, а порядок ещё не обновился с сервера.
  const visibleChats = [...chats]
    .filter((c) => !c.archivedAt)
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
    const name = c.type === 'group' ? c.name : c.members.find((m) => m.userId !== user?.id)?.user.displayName;
    return name?.toLowerCase().includes(search.toLowerCase());
  });

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

      {/* ── Archive entry — list-item стиля (h=48px компактный) ── */}
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

      {/* ── Chat list ── */}
      <div className="relative flex-1 overflow-y-auto px-1">
        <AnimatePresence>
          {filtered.length === 0 ? (
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
      </AnimatePresence>

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <ArchivedChatsDialog open={showArchive} onClose={() => setShowArchive(false)} />
    </aside>
  );
}
