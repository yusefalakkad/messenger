/**
 * Пузырёк сообщения — текст, голос, фото, видео, кружок.
 */
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { clsx } from 'clsx';
import { Check, CheckCheck, Play, Pause, Lock, CornerUpRight, CornerUpLeft, CheckCircle2, FileText, Download, Timer, Eye } from 'lucide-react';
import { format } from 'date-fns';
import Avatar from '@/components/ui/Avatar';
import ImageViewer from '@/components/media/ImageViewer';
import MessageContextMenu from './MessageContextMenu';
import EditHistoryPopover from './EditHistoryPopover';
import VoiceMessage from './VoiceMessage';
import PollBubble from '@/components/chat/PollBubble';
import { LinkPreview } from '@/components/chat/LinkPreview';
import { decryptMessage } from '@/lib/e2e';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { useCirclePlayer } from '@/stores/circlePlayer.store';
import { usePlaybackStore } from '@/stores/playback.store';
import { deleteMessage, editMessage as socketEditMessage, reactToMessage } from '@/lib/socket';
import { api } from '@/lib/api';
import { haptic } from '@/lib/native';
import { formatReplyPreview } from '@/lib/messagePreview';
import ForwardDialog from './ForwardDialog';
import type { Message } from '@messenger/shared';

// Первый http(s)-URL в тексте — для карточки OG-превью ссылки
const URL_RE = /https?:\/\/[^\s<>"')]+/i;

// Парсит текст и подсвечивает @username. Returns массив React-узлов.
const MENTION_RE = /(@[a-zA-Z0-9_]{3,32})/g;
function renderRichText(text: string): ReactNode[] {
  if (!text) return [];
  return text.split(MENTION_RE).map((part, i) => {
    if (MENTION_RE.test(part)) {
      MENTION_RE.lastIndex = 0;
      return (
        <span key={i} className="text-primary-600 dark:text-primary-300 font-medium cursor-pointer hover:underline">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface Props {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showName?: boolean;
  isCont?: boolean;
  chatId: string;
}

export default function MessageBubble({ message, isOwn, showAvatar, showName = false, isCont = false, chatId }: Props) {
  const [viewerSrc,  setViewerSrc]  = useState<string | null>(null);
  const [viewerType, setViewerType] = useState<'image' | 'video'>('image');
  const [menuPos,    setMenuPos]    = useState<{ x: number; y: number } | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // поповер истории правок
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // View-once: POST /view ровно один раз; для голосового — локальный снэпшот media,
  // чтобы инлайн-плеер пережил обнуление message.media после 'message:viewed'
  const viewedSentRef = useRef(false);
  const [revealedVoiceMedia, setRevealedVoiceMedia] = useState<Message['media'] | null>(null);

  const setReplyingTo     = useChatStore((s) => s.setReplyingTo);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);

  // Selection-mode + подсветка прыжка
  const selectedIds            = useChatStore((s) => s.selectedMessageIds);
  const toggleMessageSelection = useChatStore((s) => s.toggleMessageSelection);
  const isHighlighted          = useChatStore((s) => s.highlightMessageId === message.id);
  const selectionMode = selectedIds.length > 0;
  const isSelected    = selectedIds.includes(message.id);

  // Swipe-to-reply (touch-only): translateX с резистентностью dx/2, максимум 64px
  const swipeStart  = useRef<{ x: number; y: number; touch: boolean } | null>(null);
  const swipeActive = useRef(false);
  const swipeFired  = useRef(false); // haptic один раз за жест
  const swipeX = useMotionValue(0);
  const replyIconOpacity = useTransform(swipeX, [12, 48], [0, 1]);

  const openViewer = (src: string, type: 'image' | 'video') => {
    setViewerSrc(src);
    setViewerType(type);
  };

  // Отметить одноразовое просмотренным (guard — один раз за маунт)
  const sendViewOnce = () => {
    if (viewedSentRef.current) return;
    viewedSentRef.current = true;
    api.post(`/messages/${message.id}/view`).catch(() => {});
  };

  // Тап по плейсхолдеру одноразового: фото/видео — вьюер, голосовое — инлайн-плеер.
  // POST шлём сразу ПОСЛЕ открытия: браузер уже начал грузить файл, сервер дальше его удалит
  const handleViewOnceOpen = () => {
    const media = message.media;
    if (!media) return;
    if (message.type === 'voice') {
      setRevealedVoiceMedia(media);
    } else {
      openViewer(media.url, message.type === 'video' ? 'video' : 'image');
    }
    sendViewOnce();
  };

  // Правый клик (desktop)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  // Долгое нажатие (mobile)
  const handlePointerDown = (e: React.PointerEvent) => {
    const { clientX, clientY } = e;
    swipeStart.current  = { x: clientX, y: clientY, touch: e.pointerType === 'touch' };
    swipeActive.current = false;
    swipeFired.current  = false;
    longPressRef.current = setTimeout(() => setMenuPos({ x: clientX, y: clientY }), 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = swipeStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Движение >10px отменяет таймер контекст-меню
    if ((Math.abs(dx) > 10 || Math.abs(dy) > 10) && longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    if (!start.touch) return; // свайп-ответ — только touch
    if (!swipeActive.current) {
      // Активируем только при явном горизонтальном движении вправо
      if (dx > 10 && Math.abs(dx) > Math.abs(dy)) {
        swipeActive.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } else return;
    }
    const offset = Math.min(64, Math.max(0, dx / 2));
    swipeX.set(offset);
    if (offset >= 48 && !swipeFired.current) {
      swipeFired.current = true;
      haptic.light();
    }
  };

  const handlePointerUp = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    if (swipeActive.current) {
      if (swipeX.get() >= 48) setReplyingTo(message);
      animate(swipeX, 0, { type: 'spring', stiffness: 420, damping: 32 });
    }
    swipeStart.current  = null;
    swipeActive.current = false;
    swipeFired.current  = false;
  };

  // pointercancel (скролл перехватил жест) — просто spring назад, без reply
  const handlePointerCancel = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    if (swipeActive.current) animate(swipeX, 0, { type: 'spring', stiffness: 420, damping: 32 });
    swipeStart.current  = null;
    swipeActive.current = false;
    swipeFired.current  = false;
  };

  // Selection-mode: клик по пузырю = toggle, остальные клики (фото и т.д.) глушим
  const handleClickCapture = (e: React.MouseEvent) => {
    if (!selectionMode) return;
    e.preventDefault();
    e.stopPropagation();
    toggleMessageSelection(message.id);
  };

  const handleDelete  = () => deleteMessage(message.id, message.chatId);
  const handleEdit    = () => setEditingMessage(message);
  const handleReply   = () => setReplyingTo(message);
  const handleForward = () => setForwarding(true);
  const handleReact   = (emoji: string) => reactToMessage(message.id, message.chatId, emoji);

  const time   = format(new Date(message.createdAt), 'HH:mm');
  const isRead = message.readBy && message.readBy.length > 0;

  // Кружок — только пузырёк без внутренних отступов
  const isCircle = message.type === 'circle';
  // Опрос всегда на нейтральном фоне — на ярком градиенте текст/проценты нечитаемы.
  const isPoll = message.type === 'poll';
  // View-once: «истрачено» = просмотрено или медиа уже удалено сервером.
  // Получателю медиа в пузыре не показываем (только плейсхолдер), отправителю — как обычно
  const isViewOnce      = !!message.viewOnce;
  const viewOnceSpent   = isViewOnce && (message.viewedAt != null || !message.media);
  const showMediaInline = !!message.media && (!isViewOnce || isOwn);
  // Фото без текста — тоже убираем стандартные паддинги
  const isPureImage = message.type === 'image' && !message.content && showMediaInline;
  // Видео без подписи — аналогично
  const isPureVideo = message.type === 'video' && !message.content && showMediaInline;
  // Первая ссылка в незашифрованном тексте — рендерим OG-превью под текстом
  const firstUrl = (message.type === 'text' && !message.encrypted && message.content)
    ? message.content.match(URL_RE)?.[0] ?? null
    : null;

  // Системные сообщения — отдельный layout, без аватара/контекст-меню
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <div className="text-[11px] text-content/45 bg-content/[0.04] px-3 py-1 rounded-full">
          {message.content ?? ''}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={clsx('flex items-end gap-2 mb-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
        {/* Аватар */}
        <div className="w-8 flex-shrink-0">
          {showAvatar && !isOwn && (
            <Avatar
              src={message.sender?.avatar}
              name={message.sender?.displayName ?? '?'}
              size="sm"
            />
          )}
        </div>

        <motion.div
          className={clsx(
            'relative flex flex-col max-w-[85%] lg:max-w-[70%]',
            isOwn ? 'items-end' : 'items-start',
            // Для кружка (без пузырька) ring/подсветка вешаются на контейнер
            isCircle && isSelected    && 'ring-2 ring-primary-500/70 rounded-3xl',
            isCircle && isHighlighted && 'ring-2 ring-primary-400/60 bg-primary-500/10 rounded-3xl transition-all duration-500',
          )}
          style={{ x: swipeX, touchAction: 'pan-y' }}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClickCapture={handleClickCapture}
        >
          {/* Иконка свайп-ответа — проявляется по прогрессу свайпа */}
          <motion.div
            style={{ opacity: replyIconOpacity }}
            className="absolute -left-9 top-1/2 -translate-y-1/2 pointer-events-none"
          >
            <div className="w-7 h-7 rounded-full bg-dark-surface/90 border border-dark-border flex items-center justify-center">
              <CornerUpLeft size={16} className="text-content/70" />
            </div>
          </motion.div>

          {/* Чек-кружок выбранного сообщения */}
          {isSelected && (
            <div className="absolute -left-7 top-1/2 -translate-y-1/2 pointer-events-none">
              <CheckCircle2 size={18} className="text-primary-400" />
            </div>
          )}

          {/* Имя отправителя — только в группах, у первого в серии */}
          {showName && !isOwn && (
            <span className="text-[12px] text-primary-600 dark:text-primary-300 font-semibold mb-1 ml-3">
              {message.sender?.displayName}
            </span>
          )}

          {/* Превью цитаты */}
          {message.replyTo && (
            <div className={clsx(
              'flex items-start gap-2 px-3 py-2 rounded-xl mb-1 border-l-2',
              // Нейтральный фон + полупрозрачный border — читаемо на любом градиенте
              isOwn ? 'bg-white/15 border-white/60 backdrop-blur-sm' : 'bg-dark-hover border-primary-500',
            )}>
              <div className="min-w-0">
                <p className={clsx(
                  'text-xs font-medium truncate',
                  isOwn ? 'text-white/90' : 'text-primary-400',
                )}>
                  {(message.replyTo as any).sender?.displayName}
                </p>
                <p className={clsx('text-xs truncate', isOwn ? 'text-white/75' : 'text-content/60')}>
                  {/* Зашифрованные сообщения в reply показываем как 🔒, а не как base64-мусор */}
                  {formatReplyPreview(message.replyTo as any) || message.replyTo.content}
                </p>
              </div>
            </div>
          )}

          {/* ─── Кружок (без пузырька) ─── */}
          {isCircle && message.media && (
            <CircleMessage
              media={message.media} isOwn={isOwn} time={time}
              messageId={message.id} chatId={chatId}
              senderName={message.sender?.displayName ?? 'Кружок'}
            />
          )}

          {/* ─── Обычный пузырёк ─── */}
          {!isCircle && (
            <div className={clsx(
              // Опрос — всегда нейтральный пузырь (bubble-in), даже у отправителя.
              isPoll ? 'bubble-in' : (isOwn ? 'bubble-out' : 'bubble-in'),
              isCont && 'is-cont',
              (isPureImage || isPureVideo) ? 'p-0 overflow-hidden relative' : 'px-3.5 py-2 relative',
              'min-w-[88px]',
              isSelected    && 'ring-2 ring-primary-500/70',
              isHighlighted && 'ring-2 ring-primary-400/60 bg-primary-500/10 transition-all duration-500',
            )}>

              {/* View-once: получателю до просмотра — интерактивный плейсхолдер */}
              {isViewOnce && !isOwn && !viewOnceSpent && !revealedVoiceMedia && message.media && (
                <ViewOnceTeaser type={message.type} onOpen={handleViewOnceOpen} />
              )}

              {/* View-once голосовое после тапа — играем из локального снэпшота media */}
              {revealedVoiceMedia && (
                <VoiceMessage
                  media={revealedVoiceMedia} isOwn={isOwn}
                  messageId={message.id} chatId={chatId}
                  senderName={message.sender?.displayName ?? 'Голосовое сообщение'}
                />
              )}

              {/* View-once истрачено — «сгоревший» плейсхолдер */}
              {viewOnceSpent && !revealedVoiceMedia && (
                <p className={clsx('text-[13px] py-0.5', isOwn ? 'text-white/45' : 'text-content/45')}>🔥 Просмотрено</p>
              )}

              {/* Фото */}
              {message.type === 'image' && message.media && (!isViewOnce || isOwn) && (
                <button
                  className="block focus:outline-none"
                  onClick={() => openViewer(message.media!.url, 'image')}
                >
                  <img
                    src={message.media.url}
                    alt="фото"
                    className={clsx(
                      'object-cover block',
                      isPureImage ? 'rounded-[inherit] max-w-xs max-h-72' : 'rounded-lg max-w-xs max-h-64 mb-1',
                    )}
                  />
                  {message.content && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words px-3 pt-1 pb-1">
                      {message.content}
                    </p>
                  )}
                </button>
              )}

              {/* Видео */}
              {message.type === 'video' && message.media && (!isViewOnce || isOwn) && (
                <VideoMessage
                  media={message.media}
                  isPure={isPureVideo}
                  onExpand={() => openViewer(message.media!.url, 'video')}
                />
              )}

              {/* Forwarded badge */}
              {message.forwardedFromId && (
                <div className="flex items-center gap-1 mb-1 text-xs text-primary-400/80">
                  <CornerUpRight size={12} />
                  <span>Пересланное сообщение</span>
                </div>
              )}

              {/* Текст (обычный или зашифрованный) */}
              {message.type === 'text' && (
                message.encrypted
                  ? <EncryptedText message={message} chatId={chatId} />
                  : <>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {renderRichText(message.content ?? '')}
                        {message.editedAt && (
                          message.editHistory?.length
                            // Есть история правок — пометка кликабельна, открывает поповер версий
                            ? (
                              <span
                                className={clsx('text-xs ml-1 cursor-pointer hover:underline', isOwn ? 'text-white/40' : 'text-content/40')}
                                onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}
                              >
                                (изм.)
                              </span>
                            )
                            : <span className={clsx('text-xs ml-1', isOwn ? 'text-white/40' : 'text-content/40')}>(изм.)</span>
                        )}
                        {/* резерв места под время+галочки в углу (как в ТГ) */}
                        <span className={clsx('inline-block select-none align-bottom', isOwn ? 'w-[3.5rem]' : 'w-9')} aria-hidden> </span>
                      </p>
                      {/* OG-превью первой ссылки */}
                      {firstUrl && <LinkPreview url={firstUrl} isOwn={isOwn} />}
                    </>
              )}

              {/* Опрос — контент целиком рендерит PollBubble (вопрос + опции + голоса) */}
              {message.type === 'poll' && (
                <PollBubble message={message} isOwn={isOwn} chatId={chatId} />
              )}

              {/* Голосовое */}
              {message.type === 'voice' && message.media && (!isViewOnce || isOwn) && (
                <VoiceMessage
                  media={message.media} isOwn={isOwn}
                  messageId={message.id} chatId={chatId}
                  senderName={message.sender?.displayName ?? 'Голосовое сообщение'}
                />
              )}

              {/* Файл (документ) */}
              {message.type === 'file' && message.media && (
                <FileMessage media={message.media} isOwn={isOwn} />
              )}

              {/* Время + статус */}
              <div className={clsx(
                'flex items-center gap-1 justify-end',
                (isPureImage || isPureVideo)
                  ? 'absolute bottom-1.5 right-2'
                  : message.type === 'text'
                    ? 'absolute bottom-1 right-2.5'   // время в углу пузыря, не на отдельной строке
                    : 'mt-1',
              )}>
                {message.encrypted && (
                  <Lock size={9} className={isPureImage ? 'text-white/70' : 'text-primary-400/80'} />
                )}
                {message.expiresAt && (
                  <span title="Исчезающее сообщение" className="flex items-center">
                    <Timer size={10} className={(isPureImage || isPureVideo) ? 'text-white/80' : (isOwn ? 'text-white/50' : 'text-content/50')} />
                  </span>
                )}
                {/* View-once у отправителя: бейдж «1×», после просмотра — «Просмотрено» */}
                {isViewOnce && isOwn && (
                  viewOnceSpent
                    ? <span className="text-[10px] leading-none text-white/60">Просмотрено</span>
                    : <span className="text-[10px] leading-none px-1 rounded bg-white/15 text-white/80">1×</span>
                )}
                <span className={clsx('text-[11px] leading-none', (isPureImage || isPureVideo) ? 'text-white/80' : (isOwn ? 'text-white/50' : 'text-content/50'))}>
                  {time}
                </span>
                {isOwn && (
                  isRead
                    // прочитано → 2 светящиеся синие галочки (как в Telegram)
                    ? <CheckCheck size={13} className="text-sky-300 drop-shadow-[0_0_5px_rgba(56,189,248,0.85)]" />
                    // отправлено/доставлено → 1 галочка
                    : <Check size={12} className={(isPureImage || isPureVideo) ? 'text-white/75' : 'text-white/55'} />
                )}
              </div>
            </div>
          )}
          {/* Реакции под пузырьком */}
          {message.reactions && message.reactions.length > 0 && (
            <ReactionBar
              reactions={message.reactions}
              messageId={message.id}
              chatId={chatId}
              isOwn={isOwn}
            />
          )}
        </motion.div>
      </div>

      {/* Контекстное меню */}
      <AnimatePresence>
        {menuPos && (
          <MessageContextMenu
            message={message}
            isOwn={isOwn}
            x={menuPos.x}
            y={menuPos.y}
            onClose={() => setMenuPos(null)}
            onReply={handleReply}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onForward={handleForward}
            onReact={handleReact}
          />
        )}
      </AnimatePresence>

      {/* Форвард-диалог */}
      {forwarding && (
        <ForwardDialog messages={[message]} onClose={() => setForwarding(false)} />
      )}

      {/* Поповер истории правок */}
      <AnimatePresence>
        {showHistory && message.editHistory && (
          <EditHistoryPopover
            history={message.editHistory}
            onClose={() => setShowHistory(false)}
          />
        )}
      </AnimatePresence>

      {/* Просмотрщик фото/видео */}
      <AnimatePresence>
        {viewerSrc && (
          <ImageViewer
            src={viewerSrc}
            type={viewerType}
            onClose={() => setViewerSrc(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── View-once плейсхолдер (получатель, до просмотра) ─────────────────────────

function ViewOnceTeaser({
  type, onOpen,
}: {
  type: Message['type'];
  onOpen: () => void;
}) {
  const label = type === 'image' ? 'Фото 1×' : type === 'video' ? 'Видео 1×' : 'Голосовое 1×';
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 py-1.5 pr-2 text-left focus:outline-none"
    >
      <div className="w-11 h-11 rounded-full border border-content/20 flex items-center justify-center flex-shrink-0">
        <Eye size={20} className="text-content/80" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-content/95">{label}</span>
        <span className="text-xs text-content/50">Нажмите для просмотра</span>
      </div>
    </button>
  );
}

// ─── Видео-сообщение ──────────────────────────────────────────────────────────

function VideoMessage({
  media, onExpand, isPure,
}: {
  media: NonNullable<Message['media']>;
  onExpand: () => void;
  isPure?: boolean;
}) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden cursor-pointer group',
        isPure
          ? 'rounded-[inherit] w-full'
          : 'rounded-lg -mx-3 -mt-2 mb-1 max-w-xs',
      )}
      onClick={onExpand}
    >
      {media.thumbnailUrl ? (
        <img
          src={media.thumbnailUrl}
          className="w-full max-h-64 object-cover"
          alt=""
        />
      ) : (
        <div className="w-full h-48 bg-dark-hover flex items-center justify-center">
          <Play size={40} className="text-content/60" />
        </div>
      )}
      {/* Play overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <Play size={26} className="text-white ml-1" fill="white" />
        </div>
      </div>
      {media.duration && (
        <div className="absolute bottom-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-xs text-white font-medium">
          {formatDuration(media.duration)}
        </div>
      )}
    </div>
  );
}

// ─── Видео-кружок ─────────────────────────────────────────────────────────────

function CircleMessage({
  media, isOwn, time, messageId, chatId, senderName,
}: {
  media: NonNullable<Message['media']>;
  isOwn: boolean;
  time: string;
  messageId: string;
  chatId: string;
  senderName: string;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const draggingRef  = useRef(false);
  const wasFloating  = useRef(false);

  const [started,  setStarted]  = useState(false); // была ли первая проигровка (показываем video вместо thumb)
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);     // 0..1
  const [current,  setCurrent]  = useState(0);     // сек
  const [seeking,  setSeeking]  = useState(false);
  const [vidDur,   setVidDur]   = useState(0);

  // Глобальный PiP-стор (плавающий кружок при уходе из вида / в другой чат)
  const cpPlayInline   = useCirclePlayer((s) => s.playInline);
  const cpReport       = useCirclePlayer((s) => s.report);
  const cpDetach       = useCirclePlayer((s) => s.detach);
  const cpReattach     = useCirclePlayer((s) => s.reattach);
  const cpSetPlaying   = useCirclePlayer((s) => s.setPlaying);
  const cpStop         = useCirclePlayer((s) => s.stop);
  const isFloatingThis = useCirclePlayer((s) => s.item?.messageId === messageId && s.floating);

  // duration у webm бывает Infinity → фолбэк на media.duration
  const duration = vidDur > 0 ? vidDur : (media.duration ?? 0);

  // Геометрия кольца (viewBox 192×192, как размер кружка w-48 h-48)
  const SIZE = 192, STROKE = 4;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;

  const item = () => ({
    messageId, chatId, url: media.url, senderName,
    thumbnailUrl: media.thumbnailUrl ?? undefined, duration: media.duration ?? 0,
  });

  // Пока играет — догоняем прогресс через rAF + репортим время в стор (для PiP)
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const v = videoRef.current;
      if (v && !draggingRef.current && duration > 0) {
        setCurrent(v.currentTime);
        setProgress(Math.min(1, v.currentTime / duration));
        // Репортим в стор только когда пузырь — активный рендерер (не уехал в PiP),
        // иначе две RAF-петли (пузырь + PiP) дёргают время → дрожание кольца.
        const st = useCirclePlayer.getState();
        if (st.item?.messageId === messageId && !st.floating) cpReport(v.currentTime, duration, true);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, duration, cpReport]);

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    usePlaybackStore.getState().pause(); // «один звук за раз»: глушим голосовое
    setStarted(true);
    setPlaying(true);
    cpPlayInline(item());
    if (v.preload !== 'auto') v.preload = 'auto';
    v.play().catch(() => setPlaying(false));
  };
  const pause = () => { videoRef.current?.pause(); setPlaying(false); cpSetPlaying(false); };
  const toggle = () => { if (playing) pause(); else play(); };

  // Кружок уехал в плавающий PiP → глушим видео в пузыре (PiP играет сам).
  useEffect(() => {
    if (!isFloatingThis) return;
    videoRef.current?.pause();
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  }, [isFloatingThis]);

  // Вернулись из PiP в пузырь (стал виден) → продолжаем с того же места.
  useEffect(() => {
    const st = useCirclePlayer.getState();
    const activeThis = st.item?.messageId === messageId;
    if (wasFloating.current && !isFloatingThis && activeThis && st.playing) {
      const v = videoRef.current;
      if (v) {
        setStarted(true);
        v.currentTime = st.time;
        v.play().then(() => setPlaying(true)).catch(() => {});
      }
    }
    wasFloating.current = isFloatingThis;
  }, [isFloatingThis, messageId]);

  // IntersectionObserver: ушёл из вида во время игры → в PiP; вернулся → обратно.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      const st = useCirclePlayer.getState();
      if (st.item?.messageId !== messageId) return;
      if (!e.isIntersecting) cpDetach();
      else if (st.floating) cpReattach();
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [messageId, cpDetach, cpReattach]);

  // Размонтирование пузыря (например, ушли в другой чат) во время игры → в PiP.
  useEffect(() => () => {
    const st = useCirclePlayer.getState();
    if (st.item?.messageId === messageId && st.playing && !st.floating) st.detach();
  }, [messageId]);

  // Угол указателя → доля 0..1 (0 — сверху, по часовой), как кольцо в Telegram
  const ratioFromEvent = (e: React.PointerEvent) => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const a = Math.atan2(e.clientY - cy, e.clientX - cx); // 0 на 3 часа
    let r = (a + Math.PI / 2) / (2 * Math.PI);            // сдвигаем 0 наверх
    if (r < 0) r += 1;
    return r;
  };

  const applySeek = (r: number) => {
    setProgress(r);
    setCurrent(r * duration);
  };
  const onRingDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setSeeking(true);
    if (!started) setStarted(true);
    applySeek(ratioFromEvent(e));
  };
  const onRingMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    applySeek(ratioFromEvent(e));
  };
  const onRingUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setSeeking(false);
    const r = ratioFromEvent(e);
    const v = videoRef.current;
    if (v && duration > 0) v.currentTime = r * duration;
    applySeek(r);
    if (!playing) play(); // как в TG: после перемотки продолжаем воспроизведение
  };

  const remaining = Math.max(0, duration - current);

  return (
    <div ref={wrapRef} className={clsx('relative flex flex-col', isOwn ? 'items-end' : 'items-start')}>
      <div className="relative w-48 h-48">
        {/* Кружок (видео/превью) — центр кликается для play/pause */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden cursor-pointer shadow-xl"
          onClick={toggle}
        >
          {media.thumbnailUrl && !started && (
            <img src={media.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          )}
          <video
            ref={videoRef}
            src={media.url}
            playsInline
            preload="metadata"
            className={clsx('w-full h-full object-cover', started ? 'block' : 'hidden')}
            onLoadedMetadata={() => {
              const d = videoRef.current?.duration;
              if (d && Number.isFinite(d)) setVidDur(d);
            }}
            onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0);
              if (videoRef.current) videoRef.current.currentTime = 0;
              if (useCirclePlayer.getState().item?.messageId === messageId) cpStop(); }}
            onError={() => setPlaying(false)}
          />

          {/* Оверлей play/pause: play всегда когда не играет; pause — тонкий на ховер */}
          {!playing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Play size={22} className="text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </div>

        {/* Кольцо прогресса + перемотки. Прозрачный «hit»-обод (pointer-events:stroke)
            ловит драг только по краю, центр остаётся под tap-to-play. */}
        <svg
          ref={svgRef}
          className="absolute inset-0 -rotate-90 pointer-events-none overflow-visible"
          width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        >
          <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={STROKE} />
          <circle
            cx={SIZE/2} cy={SIZE/2} r={R}
            fill="none"
            stroke={isOwn ? '#fff' : '#a78bfa'}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: seeking ? 'none' : 'stroke-dashoffset 0.1s linear' }}
          />
          {/* бегунок */}
          {(playing || seeking || progress > 0) && (
            <circle
              cx={SIZE/2 + R * Math.cos(2 * Math.PI * progress)}
              cy={SIZE/2 + R * Math.sin(2 * Math.PI * progress)}
              r={seeking ? 7 : 5}
              fill="#fff"
              style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))', transition: seeking ? 'none' : 'r 0.1s' }}
            />
          )}
          {/* hit-обод: только по краю (stroke), не мешает центру */}
          <circle
            cx={SIZE/2} cy={SIZE/2} r={R}
            fill="none" stroke="transparent" strokeWidth={22}
            style={{ pointerEvents: 'stroke', cursor: 'pointer', touchAction: 'none' }}
            onPointerDown={onRingDown}
            onPointerMove={onRingMove}
            onPointerUp={onRingUp}
            onPointerCancel={onRingUp}
          />
        </svg>

        {/* Бейдж оставшегося времени — снизу по центру кружка, пока играет/мотаем */}
        {(playing || seeking) && duration > 0 && (
          <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
            <span className="text-[11px] text-white tabular-nums font-medium bg-black/55 px-2 py-0.5 rounded-full">
              {formatCircleTime(remaining)}
            </span>
          </div>
        )}
      </div>

      {/* Время отправки под кружком */}
      <div className="flex items-center gap-1 mt-1 mr-1">
        <span className="text-[11px] text-content/40 leading-none">{time}</span>
      </div>
    </div>
  );
}

function formatCircleTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Реакции ─────────────────────────────────────────────────────────────────

function ReactionBar({
  reactions, messageId, chatId, isOwn,
}: {
  reactions: NonNullable<Message['reactions']>;
  messageId: string;
  chatId: string;
  isOwn: boolean;
}) {
  const myUserId = useAuthStore((s) => s.user?.id);

  // Группируем по emoji
  const groups = reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
    acc[r.emoji].count++;
    if (r.userId === myUserId) acc[r.emoji].mine = true;
    return acc;
  }, {});

  return (
    <div className={clsx('flex flex-wrap gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
      {Object.entries(groups).map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          onClick={() => reactToMessage(messageId, chatId, emoji)}
          className={clsx(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-all',
            mine
              ? 'bg-primary-600/25 border-primary-500/50 text-primary-600 dark:text-primary-300'
              : 'bg-dark-hover border-dark-border text-content/60 hover:border-content/20',
          )}
        >
          <span>{emoji}</span>
          {count > 1 && <span className="font-medium">{count}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Зашифрованный текст ─────────────────────────────────────────────────────

function EncryptedText({ message, chatId }: { message: Message; chatId: string }) {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [failed,    setFailed]    = useState(false);

  // КРИТИЧНО: подписываемся на publicKey собеседника. Когда сервер шлёт user:key-changed,
  // chat.members[*].user.publicKey обновляется → effect перезапускается → decrypt с новым ключом.
  // Без этого закэшированный failed=true остаётся навсегда после ротации ключей.
  const senderPubKey = useChatStore((s) => {
    const c = s.chats.find((c) => c.id === chatId);
    if (!c) return null;
    const m = c.members.find((m) => m.userId === message.senderId);
    return m?.user.publicKey ?? null;
  });

  useEffect(() => {
    let cancelled = false;
    // Сброс failed при изменении ключа — даём попытку расшифровать заново
    setFailed(false);
    setPlaintext(null);

    (async () => {
      try {
        const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
        const { user, privateKey } = useAuthStore.getState();
        if (!chat || !user || !privateKey) { setFailed(true); return; }

        const text = await decryptMessage(message, chat, user.id, privateKey);
        if (!cancelled) setPlaintext(text);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [message.id, chatId, senderPubKey]);

  if (failed) {
    return (
      <p className="text-xs text-content/35 italic flex items-center gap-1.5">
        <Lock size={11} />
        <span>Сообщение из прошлой сессии</span>
      </p>
    );
  }

  if (plaintext === null) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <Lock size={11} className="text-content/30 animate-pulse" />
        <span className="text-xs text-content/30">Расшифровка...</span>
      </div>
    );
  }

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {renderRichText(plaintext)}
    </p>
  );
}

// ─── Файл (документ) ─────────────────────────────────────────────────────────

function FileMessage({
  media, isOwn,
}: {
  media: NonNullable<Message['media']>;
  isOwn: boolean;
}) {
  const name = (media as any).filename ?? media.url.split('/').pop() ?? 'файл';
  const sizeStr = (media as any).size ? formatFileSize((media as any).size) : '';

  return (
    <a
      href={media.url}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 min-w-[200px] max-w-[280px] py-1"
    >
      <div className={clsx(
        'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
        isOwn ? 'bg-white/20' : 'bg-primary-600',
      )}>
        <FileText size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm font-medium truncate', isOwn ? 'text-white' : 'text-content/95')}>
          {name}
        </p>
        {sizeStr && (
          <p className={clsx('text-xs', isOwn ? 'text-white/70' : 'text-content/45')}>
            {sizeStr}
          </p>
        )}
      </div>
      <Download size={16} className={isOwn ? 'text-white/80' : 'text-content/50'} />
    </a>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
