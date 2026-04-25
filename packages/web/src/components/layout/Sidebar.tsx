import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Plus, LogOut, Users, MessageSquarePlus, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import Avatar from '@/components/ui/Avatar';
import ChatListItem from '@/components/chat/ChatListItem';
import NewChatModal from '@/components/chat/NewChatModal';
import NewGroupModal from '@/components/chat/NewGroupModal';

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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const filtered = chats.filter((c) => {
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
    <aside className="w-80 flex-shrink-0 flex flex-col border-r border-dark-border bg-dark-surface">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-border">

        {/* Аватар с возможностью смены */}
        <div className="relative flex-shrink-0 group">
          <Avatar
            src={user?.avatar}
            name={user?.displayName ?? '?'}
            size="md"
            online
          />
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
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
          <p className="font-medium text-sm truncate">{user?.displayName}</p>
          <p className="text-white/40 text-xs truncate">@{user?.username}</p>
        </div>

        <div className="flex items-center gap-1">
          {/* Кнопка «+» с выпадающим меню */}
          <div className="relative">
            <button
              onClick={() => setShowPlus((v) => !v)}
              className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white"
              title="Новый чат или группа"
            >
              <Plus size={18} />
            </button>

            <AnimatePresence>
              {showPlus && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setShowPlus(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute right-0 top-full mt-1 bg-dark-card border border-dark-border rounded-xl shadow-2xl z-20 overflow-hidden min-w-[180px]"
                  >
                    <button
                      onClick={() => { setShowNewChat(true); setShowPlus(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors text-sm"
                    >
                      <MessageSquarePlus size={16} className="text-primary-400" />
                      <span>Новый чат</span>
                    </button>
                    <button
                      onClick={() => { setShowNewGroup(true); setShowPlus(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors text-sm"
                    >
                      <Users size={16} className="text-primary-400" />
                      <span>Новая группа</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white"
            title="Выйти"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            className="w-full bg-dark-bg border border-dark-border rounded-xl pl-9 pr-4 py-2.5
                       text-sm placeholder-white/30 text-white outline-none
                       focus:border-primary-500/50 transition-colors"
            placeholder="Поиск чатов..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Chat list ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/30 text-sm gap-2">
              <Users size={28} className="opacity-30" />
              <p>Нет чатов</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="text-primary-400 hover:text-primary-300 text-xs"
              >
                Начать переписку
              </button>
            </div>
          ) : (
            filtered.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                active={chat.id === chatId}
                onClick={() => navigate(`/chat/${chat.id}`)}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showNewChat  && <NewChatModal  onClose={() => setShowNewChat(false)} />}
        {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
      </AnimatePresence>
    </aside>
  );
}
