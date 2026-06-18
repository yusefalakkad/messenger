import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, LogOut, Users, MessageSquarePlus, Camera, Settings, Archive, Bookmark, Megaphone, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { listParent, listChild, tap, SPRING } from '@/lib/motion';
import { useChatStore } from '@/stores/chat.store';
import { useFoldersStore } from '@/stores/folders.store';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { desktopDownload } from '@/lib/desktopDownload';
import Avatar from '@/components/ui/Avatar';
import IconBtn from '@/components/ui/IconBtn';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import ChatListItem from '@/components/chat/ChatListItem';
import NewChatModal from '@/components/chat/NewChatModal';
import NewGroupModal from '@/components/chat/NewGroupModal';
import NewChannelModal from '@/components/chat/NewChannelModal';
import ArchivedChatsDialog from '@/components/chat/ArchivedChatsDialog';
import GlobalSearchOverlay from '@/components/chat/GlobalSearchOverlay';
import FolderTabs from '@/components/layout/FolderTabs';
import FolderEditModal from '@/components/layout/FolderEditModal';
import GroupCallPill from '@/components/call/GroupCallPill';
import type { Chat } from '@messenger/shared';

export default function Sidebar() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
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
  const [showArchive,  setShowArchive]  = useState(false);
  // Настройки открываются и из сайдбара, и из мобильного таб-бара → общий ui-стор.
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
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
    // «Избранное» (saved) исключаем из общего списка — у него отдельный
    // постоянный пункт выше, иначе дублируется (два «Избранное»).
    .filter((c) => c.type !== 'saved')
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
    <aside className="w-full h-full flex flex-col border-r border-white/10 lg:border-dark-border bg-dark-surface/40 lg:bg-dark-surface/80 backdrop-blur-xl relative pt-[var(--sat)]">
      {/* Ambient свечение в шапке сайдбара */}
      <div className="absolute -top-20 -left-10 w-64 h-64 bg-spot-violet blur-3xl opacity-40 pointer-events-none" />

      {/* ── Mobile header — как в Telegram: компактный, заголовок по центру,
             «написать» справа. Настройки/аватар/выход живут в таб-баре. ── */}
      <div className="lg:hidden relative flex items-center justify-center px-3 h-14 flex-shrink-0 border-b border-dark-border">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">{t('nav.chats')}</h1>
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <motion.button
            onClick={() => setShowPlus((v) => !v)}
            whileTap={tap}
            transition={SPRING.snappy}
            className="w-9 h-9 rounded-full text-white flex items-center justify-center active:opacity-90"
            style={{ background: 'linear-gradient(142deg, #ff6b72, #ff9a5c)', boxShadow: '0 4px 14px -4px rgba(255,107,114,0.6)' }}
            title={t('chat.newChat')}
            aria-label={t('chat.newChat')}
          >
            <MessageSquarePlus size={18} />
          </motion.button>
          <Dropdown open={showPlus} onClose={() => setShowPlus(false)}>
            <DropdownItem icon={<MessageSquarePlus size={16} />} label={t('chat.newChat')}    onClick={() => { setShowNewChat(true); setShowPlus(false); }} />
            <DropdownItem icon={<Users size={16} />}            label={t('chat.newGroup')}   onClick={() => { setShowNewGroup(true); setShowPlus(false); }} />
            <DropdownItem icon={<Megaphone size={16} />}        label={t('chat.newChannel')} onClick={() => { setShowNewChannel(true); setShowPlus(false); }} />
          </Dropdown>
        </div>
      </div>

      {/* ── Desktop header (h=64px, hit-target ≥44px): аватар, имя, +, настройки, выход ── */}
      <div className="electron-sb-header hidden lg:flex relative items-center gap-3 px-4 h-16 flex-shrink-0">

        {/* Аватар в градиентном кольце с возможностью смены */}
        <div className="relative flex-shrink-0 group">
          <div className="ring-gradient">
            <div className="rounded-full bg-dark-surface p-[2px]">
              <Avatar
                src={user?.avatar}
                name={user?.displayName ?? '?'}
                size="md"
              />
            </div>
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute inset-1 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            title={t('chat.changePhoto')}
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
          <p className="text-content/45 text-[12px] truncate mt-0.5">@{user?.username}</p>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative">
            <IconBtn onClick={() => setShowPlus((v) => !v)} active={showPlus} title={t('chat.newChatOrGroup')}>
              <Plus size={18} />
            </IconBtn>
            <Dropdown open={showPlus} onClose={() => setShowPlus(false)}>
              <DropdownItem
                icon={<MessageSquarePlus size={16} />} label={t('chat.newChat')}
                onClick={() => { setShowNewChat(true); setShowPlus(false); }}
              />
              <DropdownItem
                icon={<Users size={16} />} label={t('chat.newGroup')}
                onClick={() => { setShowNewGroup(true); setShowPlus(false); }}
              />
              <DropdownItem
                icon={<Megaphone size={16} />} label={t('chat.newChannel')}
                onClick={() => { setShowNewChannel(true); setShowPlus(false); }}
              />
            </Dropdown>
          </div>

          <IconBtn onClick={() => setSettingsOpen(true)} title={t('nav.settings')}>
            <Settings size={18} />
          </IconBtn>

          <IconBtn onClick={handleLogout} title={t('chat.logout')}>
            <LogOut size={18} />
          </IconBtn>
        </div>
      </div>

      {/* ── In-call pill (LiveKit групповой звонок, виден только в активном звонке) ── */}
      <GroupCallPill />

      {/* ── Search — выровнен по тому же левому краю, что Архив/Избранное/чаты ── */}
      <div className="px-2 py-3 flex-shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content/40" />
          <input
            className="input-pill w-full"
            placeholder={t('chat.searchChats')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Folder tabs — «Все» + папки + «+» ── */}
      <FolderTabs onEditFolder={(id) => setEditFolder({ open: true, id })} />

      {/* ── Архив + Избранное — мобила: в линию (две половинки); десктоп: в столбик
             во всю ширину (без обрезки длинных подписей вроде «Saved Messages»). ── */}
      {!activeFolderId && (
      <div className="flex gap-2 lg:flex-col lg:gap-0.5 px-2 mb-1.5 flex-shrink-0">
        <motion.button
          onClick={() => setShowArchive(true)}
          whileTap={tap}
          transition={SPRING.snappy}
          className="flex-1 lg:flex-none min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-2xl lg:rounded-lg text-left group max-lg:liquid-card lg:hover:bg-dark-hover/60 transition-colors"
          title={t('chat.archivedChats')}
        >
          <span className="w-10 h-10 flex-shrink-0 rounded-full bg-accent-violet/15 flex items-center justify-center text-accent-violet group-hover:scale-105 transition-transform">
            <Archive size={18} />
          </span>
          <span className="flex-1 min-w-0 truncate text-content/85 font-medium text-[14px]">{t('chat.archive')}</span>
          {archivedCount > 0 && (
            <span className="text-[12px] font-medium text-content/50 tabular-nums">{archivedCount}</span>
          )}
        </motion.button>

        <motion.button
          onClick={openSaved}
          whileTap={tap}
          transition={SPRING.snappy}
          className="flex-1 lg:flex-none min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-2xl lg:rounded-lg text-left group max-lg:liquid-card lg:hover:bg-dark-hover/60 transition-colors"
          title={t('chat.saved')}
        >
          <span className="w-10 h-10 flex-shrink-0 rounded-full bg-primary-500/15 flex items-center justify-center text-primary-400 group-hover:scale-105 transition-transform">
            <Bookmark size={18} />
          </span>
          <span className="flex-1 min-w-0 truncate text-content/85 font-medium text-[14px]">{t('chat.saved')}</span>
        </motion.button>
      </div>
      )}

      {/* ── Chat list (без доп. px — левый край совпадает с поиском/Архивом) ──
             pb на мобиле — чтобы последние чаты не прятались за плавающим таб-баром. */}
      <div className="relative flex-1 overflow-y-auto pb-24 lg:pb-0">
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
        <AnimatePresence mode="wait">
          {showGlobalSearch ? null : filtered.length === 0 ? (
            // Премиум пустое состояние — иконка в rounded-2xl с brand-glow + текст + CTA
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center justify-center mt-16 px-6 gap-4 text-center"
            >
              <div className="relative">
                <div className="absolute -inset-2 bg-brand-gradient blur-2xl opacity-25 rounded-[28px]" />
                <div className="relative w-16 h-16 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center shadow-e2">
                  <MessageSquarePlus size={26} className="text-content/55" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-content/90 text-[15px] font-semibold">{t('chat.emptyTitle')}</p>
                <p className="text-content/45 text-[13px] leading-5 max-w-[220px]">
                  {t('chat.emptyHint')}
                </p>
              </div>
              <motion.button
                onClick={() => setShowNewChat(true)}
                whileTap={tap}
                whileHover={{ scale: 1.04 }}
                transition={SPRING.snappy}
                className="btn-primary btn-sm mt-1"
              >
                <MessageSquarePlus size={15} />
                {t('chat.startChat')}
              </motion.button>
            </motion.div>
          ) : (
            // Stagger-появление списка чатов
            <motion.div
              key="list"
              variants={listParent}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence initial={false}>
                {filtered.map((chat) => (
                  <motion.div
                    key={chat.id}
                    layout="position"
                    variants={listChild}
                    exit={{ opacity: 0, x: -24, height: 0, transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }}
                  >
                    <ChatListItem
                      chat={chat}
                      active={chat.id === chatId}
                      onClick={() => navigate(`/chat/${chat.id}`)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Скачать десктоп-приложение (только на сайте-десктопе; на телефоне внизу
             таб-бар, а десктоп-установщик там не нужен — поэтому hidden lg:block) ── */}
      {!(window as { dakkaDesktop?: { isDesktop?: boolean } }).dakkaDesktop?.isDesktop && (
        <div className="hidden lg:block px-2 pb-3 pt-1 flex-shrink-0">
          <a
            href={desktopDownload().url ?? 'https://akkdmsg.online/download'}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-11 rounded-xl bg-brand-gradient text-white font-semibold text-[13.5px] shadow-glow-violet hover:opacity-95 active:scale-[0.98] transition"
          >
            <Download size={17} /> {desktopDownload().label}
          </a>
        </div>
      )}

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

      <ArchivedChatsDialog open={showArchive} onClose={() => setShowArchive(false)} />
    </aside>
  );
}
