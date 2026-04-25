/**
 * Пузырёк сообщения — текст, голос, фото, видео, кружок.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Check, CheckCheck, Play, Pause, Lock } from 'lucide-react';
import { format } from 'date-fns';
import Avatar from '@/components/ui/Avatar';
import ImageViewer from '@/components/media/ImageViewer';
import MessageContextMenu from './MessageContextMenu';
import { decryptMessage } from '@/lib/e2e';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { deleteMessage, editMessage as socketEditMessage, reactToMessage } from '@/lib/socket';
import type { Message } from '@messenger/shared';

interface Props {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  chatId: string;
}

export default function MessageBubble({ message, isOwn, showAvatar, chatId }: Props) {
  const [viewerSrc,  setViewerSrc]  = useState<string | null>(null);
  const [viewerType, setViewerType] = useState<'image' | 'video'>('image');
  const [menuPos,    setMenuPos]    = useState<{ x: number; y: number } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setReplyingTo     = useChatStore((s) => s.setReplyingTo);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);

  const openViewer = (src: string, type: 'image' | 'video') => {
    setViewerSrc(src);
    setViewerType(type);
  };

  // Правый клик (desktop)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  // Долгое нажатие (mobile)
  const handlePointerDown = (e: React.PointerEvent) => {
    const { clientX, clientY } = e;
    longPressRef.current = setTimeout(() => setMenuPos({ x: clientX, y: clientY }), 500);
  };
  const handlePointerUp = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };

  const handleDelete = () => deleteMessage(message.id, message.chatId);
  const handleEdit   = () => setEditingMessage(message);
  const handleReply  = () => setReplyingTo(message);
  const handleReact  = (emoji: string) => reactToMessage(message.id, message.chatId, emoji);

  const time   = format(new Date(message.createdAt), 'HH:mm');
  const isRead = message.readBy && message.readBy.length > 0;

  // Кружок — только пузырёк без внутренних отступов
  const isCircle = message.type === 'circle';
  // Фото без текста — тоже убираем стандартные паддинги
  const isPureImage = message.type === 'image' && !message.content;
  // Видео без подписи — аналогично
  const isPureVideo = message.type === 'video' && !message.content;

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

        <div
          className={clsx('flex flex-col max-w-[70%]', isOwn ? 'items-end' : 'items-start')}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Имя отправителя (группы) */}
          {showAvatar && !isOwn && (
            <span className="text-xs text-primary-400 font-medium mb-1 ml-3">
              {message.sender?.displayName}
            </span>
          )}

          {/* Превью цитаты */}
          {message.replyTo && (
            <div className={clsx(
              'flex items-start gap-2 px-3 py-2 rounded-xl mb-1 border-l-2 border-primary-500',
              isOwn ? 'bg-primary-700/50' : 'bg-dark-hover',
            )}>
              <div className="min-w-0">
                <p className="text-xs text-primary-400 font-medium truncate">
                  {(message.replyTo as any).sender?.displayName}
                </p>
                <p className="text-xs text-white/60 truncate">{message.replyTo.content}</p>
              </div>
            </div>
          )}

          {/* ─── Кружок (без пузырька) ─── */}
          {isCircle && message.media && (
            <CircleMessage media={message.media} isOwn={isOwn} time={time} />
          )}

          {/* ─── Обычный пузырёк ─── */}
          {!isCircle && (
            <div className={clsx(
              isOwn ? 'bubble-out' : 'bubble-in',
              (isPureImage || isPureVideo) ? 'p-0 overflow-hidden relative' : 'px-3 py-2',
              'min-w-[80px]',
            )}>

              {/* Фото */}
              {message.type === 'image' && message.media && (
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
              {message.type === 'video' && message.media && (
                <VideoMessage
                  media={message.media}
                  isPure={isPureVideo}
                  onExpand={() => openViewer(message.media!.url, 'video')}
                />
              )}

              {/* Текст (обычный или зашифрованный) */}
              {message.type === 'text' && (
                message.encrypted
                  ? <EncryptedText message={message} chatId={chatId} />
                  : <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                      {message.editedAt && <span className="text-white/40 text-xs ml-1">(изм.)</span>}
                    </p>
              )}

              {/* Голосовое */}
              {message.type === 'voice' && message.media && (
                <VoiceMessage media={message.media} isOwn={isOwn} />
              )}

              {/* Время + статус */}
              <div className={clsx(
                'flex items-center gap-1 mt-1 justify-end',
                (isPureImage || isPureVideo) && 'absolute bottom-1.5 right-2',
              )}>
                {message.encrypted && (
                  <Lock size={9} className={isPureImage ? 'text-white/70' : 'text-primary-400/80'} />
                )}
                <span className={clsx('text-[11px] leading-none', (isPureImage || isPureVideo) ? 'text-white/80' : 'text-white/50')}>
                  {time}
                </span>
                {isOwn && (
                  isRead
                    ? <CheckCheck size={12} className="text-primary-300" />
                    : <Check size={12} className="text-white/50" />
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
        </div>
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
            onReact={handleReact}
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

// ─── Голосовое сообщение ──────────────────────────────────────────────────────

function VoiceMessage({
  media, isOwn,
}: {
  media: NonNullable<Message['media']>;
  isOwn: boolean;
}) {
  const audioRef  = useRef<HTMLAudioElement>(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0); // 0..1

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play().catch(() => {}); setPlaying(true); }
  }, [playing]);

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (a && a.duration) setProgress(a.currentTime / a.duration);
  };

  const handleEnded = () => { setPlaying(false); setProgress(0); };

  const totalBars = 40;
  const bars = media.waveform
    ?? Array.from({ length: totalBars }, (_, i) => 0.3 + 0.5 * Math.sin(i * 0.4));
  const filledCount = Math.round(progress * bars.length);

  return (
    <div className="flex items-center gap-3 py-1 min-w-[200px] pr-2">
      <audio
        ref={audioRef}
        src={media.url}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Кнопка play/pause */}
      <button
        onClick={toggle}
        className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
          isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-primary-600 hover:bg-primary-500',
        )}
      >
        {playing
          ? <Pause size={15} fill="currentColor" className="text-white" />
          : <Play  size={15} fill="currentColor" className="text-white ml-0.5" />
        }
      </button>

      {/* Waveform с прогрессом */}
      <div className="flex items-center gap-[2px] flex-1 h-9">
        {bars.map((h: number, i: number) => (
          <div
            key={i}
            className={clsx(
              'flex-1 rounded-full transition-colors duration-75',
              i < filledCount
                ? (isOwn ? 'bg-white' : 'bg-primary-400')
                : (isOwn ? 'bg-white/35' : 'bg-white/25'),
            )}
            style={{ height: `${Math.max(3, h * 28)}px` }}
          />
        ))}
      </div>

      {/* Длительность */}
      <span className="text-xs text-white/50 flex-shrink-0 tabular-nums">
        {formatDuration(media.duration ?? 0)}
      </span>
    </div>
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
          <Play size={40} className="text-white/60" />
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
  media, isOwn, time,
}: {
  media: NonNullable<Message['media']>;
  isOwn: boolean;
  time: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const isRead = false; // кружок не имеет статуса читки здесь — передаётся снаружи если нужно

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else         { v.play().catch(() => {}); setPlaying(true); }
  };

  return (
    <div
      className={clsx('relative flex flex-col', isOwn ? 'items-end' : 'items-start')}
    >
      <div
        className="relative w-48 h-48 rounded-full overflow-hidden cursor-pointer shadow-xl"
        onClick={toggle}
      >
        {/* Превью / видео */}
        {media.thumbnailUrl && !playing && (
          <img src={media.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        )}
        <video
          ref={videoRef}
          src={media.url}
          playsInline
          loop
          className={clsx('w-full h-full object-cover', playing ? 'block' : 'hidden')}
          onEnded={() => setPlaying(false)}
        />

        {/* Оверлей с кнопкой */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Play size={22} className="text-white ml-1" fill="white" />
            </div>
          </div>
        )}

      </div>

      {/* Время под кружком */}
      <div className="flex items-center gap-1 mt-1 mr-1">
        <span className="text-[11px] text-white/40 leading-none">{time}</span>
      </div>
    </div>
  );
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
              ? 'bg-primary-600/25 border-primary-500/50 text-primary-300'
              : 'bg-dark-hover border-dark-border text-white/60 hover:border-white/20',
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

  useEffect(() => {
    let cancelled = false;

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
  }, [message.id, chatId]);

  if (failed) {
    return (
      <p className="text-xs text-white/35 italic flex items-center gap-1">
        <Lock size={11} />Не удалось расшифровать
      </p>
    );
  }

  if (plaintext === null) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <Lock size={11} className="text-white/30 animate-pulse" />
        <span className="text-xs text-white/30">Расшифровка...</span>
      </div>
    );
  }

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {plaintext}
    </p>
  );
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
