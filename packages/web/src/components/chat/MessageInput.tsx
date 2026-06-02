/**
 * Панель ввода.
 * • Текст → Enter или кнопка Send
 * • Голос / Кружок — переключаются коротким тапом на кнопку
 * • Зажать кнопку → запись сразу; отпустить → отправить
 * • Зажать и потянуть ВВЕРХ → фиксация записи (продолжает без удержания)
 * • В фиксированном режиме: × отмена, ✓ отправить
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Paperclip, Mic, Send, Image as ImageIcon, Video, CircleDot, X, Lock, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { sendMessage, sendTyping } from '@/lib/socket';
import { api } from '@/lib/api';
import { haptic } from '@/lib/native';
import { toast } from '@/lib/toast';
import { encryptText, isChatE2E, getRecipientPublicKey } from '@/lib/e2e';
import { formatReplyPreview } from '@/lib/messagePreview';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { editMessage as socketEditMsg } from '@/lib/socket';
import CircleRecorder from '@/components/media/CircleRecorder';
import VideoRecorder from '@/components/chat/VideoRecorder';
import MediaPreview, { type PendingMedia } from '@/components/media/MediaPreview';
import EmojiPicker from '@/components/ui/EmojiPicker';
import IconBtn from '@/components/ui/IconBtn';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import MentionAutocomplete from './MentionAutocomplete';
import type { MessageType } from '@messenger/shared';

interface Props { chatId: string; }

const BAR_COUNT = 30;

export default function MessageInput({ chatId }: Props) {
  const [text,         setText]         = useState('');
  const [showAttach,   setShowAttach]   = useState(false);
  const [showEmoji,    setShowEmoji]    = useState(false);
  const [showCircle,   setShowCircle]   = useState(false);
  const [showVideoRec, setShowVideoRec] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState<string | null>(null);

  // Автокомплит @username — { query, caretStart } или null если не активен
  const [mention, setMention] = useState<{ query: string; startIdx: number } | null>(null);

  const replyingTo      = useChatStore((s) => s.replyingTo);
  const editingMessage  = useChatStore((s) => s.editingMessage);
  const setReplyingTo   = useChatStore((s) => s.setReplyingTo);
  const setEditingMsg   = useChatStore((s) => s.setEditingMessage);

  // Режим кнопки: голос или кружок
  const [recMode, setRecMode] = useState<'voice' | 'circle'>('voice');

  // PTT состояние
  const [pttState,      setPttState]      = useState<'idle' | 'recording' | 'locked'>('idle');
  const [pttTime,       setPttTime]       = useState(0);
  const [pttBars,       setPttBars]       = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [lockProgress,  setLockProgress]  = useState(0);   // 0..1 - насколько потянул вверх
  const [showCancel,    setShowCancel]    = useState(false); // потянул влево

  // Рефы (избегаем stale closures и двойного StrictMode-монтирования)
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef  = useRef<HTMLInputElement>(null);
  const videoInputRef  = useRef<HTMLInputElement>(null);

  const ptt = useRef({
    // recording hardware
    stream:        null as MediaStream | null,
    recorder:      null as MediaRecorder | null,
    analyser:      null as AnalyserNode | null,
    audioCtx:      null as AudioContext | null,
    animFrame:     null as number | null,
    timer:         null as ReturnType<typeof setInterval> | null,
    chunks:        [] as BlobPart[],
    barsHistory:   [] as number[],
    // tracking
    pressTimer:    null as ReturnType<typeof setTimeout> | null,
    startY:        0,
    startX:        0,
    locked:        false,
    cancelMode:    false,
    time:          0,
  });

  // ─── Авто-ресайз textarea ────────────────────────────────────────────────────

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [text]);

  // Заполнить textarea при входе в режим редактирования
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content ?? '');
      textareaRef.current?.focus();
    }
  }, [editingMessage?.id]);

  // ─── Черновики ──────────────────────────────────────────────────────────────
  // При входе в чат — подгружаем сохранённый текст; при выходе/смене — сохраняем.

  useEffect(() => {
    if (editingMessage) return;
    const draft = localStorage.getItem(`draft:${chatId}`);
    setText(draft ?? '');
  }, [chatId]);

  useEffect(() => {
    if (editingMessage) return;
    const t = text.trim();
    if (t) localStorage.setItem(`draft:${chatId}`, text);
    else   localStorage.removeItem(`draft:${chatId}`);
  }, [text, chatId, editingMessage]);

  // ─── Очистка при смене чата ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      const d = ptt.current;
      if (d.animFrame) cancelAnimationFrame(d.animFrame);
      if (d.timer)     clearInterval(d.timer);
      if (d.pressTimer) clearTimeout(d.pressTimer);
      d.stream?.getTracks().forEach((t) => t.stop());
      try { d.audioCtx?.close(); } catch {}
    };
  }, [chatId]);

  // ─── Текст ───────────────────────────────────────────────────────────────────

  const handleTyping = useCallback(() => {
    sendTyping(chatId, true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTyping(chatId, false), 2000);
  }, [chatId]);

  const handleSend = useCallback(async () => {
    const t = text.trim();
    if (!t) return;
    haptic.light();
    setText('');
    sendTyping(chatId, false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    // ── Режим редактирования ──
    if (editingMessage) {
      socketEditMsg(editingMessage.id, chatId, t);
      setEditingMsg(null);
      return;
    }

    // ── Обычная отправка / ответ ──
    const chat       = useChatStore.getState().chats.find((c) => c.id === chatId);
    const { user, privateKey } = useAuthStore.getState();
    const replyToId = replyingTo?.id;
    setReplyingTo(null);

    if (chat && isChatE2E(chat)) {
      // E2E-чат — отправка ОБЯЗАНА быть зашифрованной. Никакого fallback в plaintext.
      if (!user || !privateKey) {
        haptic.error?.();
        toast.error('Не удалось отправить: приватный ключ недоступен. Перелогиньтесь.');
        setText(t); // вернём текст в поле, чтобы пользователь не потерял
        return;
      }
      const recipientPub = getRecipientPublicKey(chat, user.id);
      if (!recipientPub) {
        haptic.error?.();
        toast.error('Не удалось отправить: у получателя нет ключа шифрования.');
        setText(t);
        return;
      }
      try {
        const { ciphertext, nonce } = await encryptText(chatId, t, recipientPub, privateKey);
        sendMessage({ chatId, type: 'text', content: ciphertext, nonce, encrypted: true, replyToId });
        return;
      } catch (err) {
        console.error('[E2E] Encryption failed', err);
        haptic.error?.();
        toast.error('Ошибка шифрования. Сообщение не отправлено.');
        setText(t);
        return;
      }
    }

    // Чат БЕЗ E2E (например, групповой) — обычная отправка
    sendMessage({ chatId, type: 'text', content: t, replyToId });
  }, [chatId, text, editingMessage, replyingTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Если открыт @-автокомплит, он сам перехватывает нав. клавиши.
    if (mention && ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      if (e.key === 'Enter' || e.key === 'Tab') e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Парсит @partial перед кареткой; возвращает null если не в режиме @.
  const detectMention = (value: string, caret: number): { query: string; startIdx: number } | null => {
    let i = caret - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === '@') {
        const prev = i === 0 ? null : value[i - 1];
        if (prev === null || /\s/.test(prev)) {
          return { startIdx: i, query: value.slice(i + 1, caret) };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    handleTyping();
    const caret = e.target.selectionStart ?? value.length;
    setMention(detectMention(value, caret));
  };

  const insertMention = useCallback((username: string) => {
    if (!mention) return;
    const before = text.slice(0, mention.startIdx);
    const after  = text.slice(mention.startIdx + 1 + mention.query.length);
    const newText = `${before}@${username} ${after}`;
    setText(newText);
    setMention(null);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const caret = mention.startIdx + 2 + username.length;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    }, 0);
  }, [mention, text]);

  // ─── PTT: запуск голосовой записи ────────────────────────────────────────────

  const startVoicePTT = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source   = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      const audioMime = [
        'audio/webm;codecs=opus', 'audio/webm',
        'audio/ogg;codecs=opus',  'audio/mp4',
      ].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const mr = new MediaRecorder(stream, audioMime ? { mimeType: audioMime } : undefined);
      mr.ondataavailable = (e) => { if (e.data.size > 0) ptt.current.chunks.push(e.data); };

      const d = ptt.current;
      d.stream      = stream;
      d.audioCtx    = audioCtx;
      d.analyser    = analyser;
      d.recorder    = mr;
      d.chunks      = [];
      d.barsHistory = [];
      d.time        = 0;
      d.locked      = false;
      d.cancelMode  = false;

      mr.start(100);
      setPttState('recording');
      setPttTime(0);
      setPttBars(Array(BAR_COUNT).fill(0));
      setLockProgress(0);
      setShowCancel(false);

      // Таймер
      d.timer = setInterval(() => {
        d.time++;
        setPttTime(d.time);
        if (d.time >= 300) stopVoicePTT(true);
      }, 1000);

      // Waveform
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = Array.from(data.slice(0, 30)).reduce((s, v) => s + v, 0) / 30 / 255;
        d.barsHistory = [avg, ...d.barsHistory].slice(0, BAR_COUNT);
        setPttBars([...d.barsHistory, ...Array(BAR_COUNT).fill(0)].slice(0, BAR_COUNT));
        d.animFrame = requestAnimationFrame(tick);
      };
      d.animFrame = requestAnimationFrame(tick);

    } catch {
      // микрофон недоступен
    }
  }, []);

  // ─── PTT: остановка ──────────────────────────────────────────────────────────

  const stopVoicePTT = useCallback(async (send: boolean) => {
    const d = ptt.current;
    if (!d.recorder || d.recorder.state === 'inactive') return;

    if (d.animFrame) { cancelAnimationFrame(d.animFrame); d.animFrame = null; }
    if (d.timer)     { clearInterval(d.timer); d.timer = null; }

    const finalBars = [...d.barsHistory].reverse();
    const duration  = d.time;

    d.recorder.onstop = async () => {
      const blob = new Blob(d.chunks, { type: d.recorder?.mimeType || 'audio/webm' });
      d.stream?.getTracks().forEach((t) => t.stop());
      d.stream = null;
      try { d.audioCtx?.close(); } catch {}
      d.audioCtx = null;

      if (send && blob.size > 500) {
        setUploading(true);
        try {
          const form = new FormData();
          form.append('file', blob, 'voice.webm');
          form.append('duration', String(Math.max(1, duration)));
          form.append('waveform', JSON.stringify(finalBars));
          const { data } = await api.post('/media/upload/voice', form);
          const m = data.data;
          sendMessage({
            chatId,
            type: 'voice',
            mediaData: {
              url: m.url, mimeType: m.mimeType, size: m.size,
              duration: Math.max(1, duration), waveform: finalBars,
            },
          });
        } catch (err) {
          console.error('Voice upload failed', err);
          setUploadError('Не удалось отправить голосовое');
          setTimeout(() => setUploadError(null), 3000);
        }
        finally { setUploading(false); }
      }
    };

    d.recorder.stop();
    d.locked = false;
    setPttState('idle');
    setPttTime(0);
    setPttBars(Array(BAR_COUNT).fill(0));
    setLockProgress(0);
    setShowCancel(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // ─── PTT: фиксация ───────────────────────────────────────────────────────────

  const lockPTT = useCallback(() => {
    if (ptt.current.locked) return;
    ptt.current.locked = true;
    setLockProgress(1);
    setPttState('locked');
  }, []);

  // ─── Кнопка записи: pointer events ───────────────────────────────────────────

  const onRecBtnDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pttState !== 'idle') return; // не начинаем новый таймер во время записи
    const d = ptt.current;
    d.startY = e.clientY;
    d.startX = e.clientX;

    d.pressTimer = setTimeout(() => {
      d.pressTimer = null; // таймер сработал — это долгое нажатие
      haptic.medium();
      if (recMode === 'circle') {
        setShowCircle(true);
      } else {
        startVoicePTT();
      }
    }, 180);
  }, [recMode, startVoicePTT, pttState]);

  const onRecBtnMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (pttState !== 'recording') return;
    const d     = ptt.current;
    const dy    = e.clientY - d.startY; // отрицательный = вверх
    const dx    = e.clientX - d.startX; // отрицательный = влево

    // Тянем вверх → фиксация
    if (dy < -40) {
      const p = Math.min(1, Math.abs(dy + 40) / 80);
      setLockProgress(p);
      if (dy < -120) lockPTT();
    } else {
      setLockProgress(0);
    }

    // Тянем влево → отмена
    setShowCancel(dx < -60);
  }, [pttState, lockPTT]);

  const onRecBtnUp = useCallback((_e: React.PointerEvent<HTMLButtonElement>) => {
    const d = ptt.current;

    // Это был короткий тап — таймер ещё не сработал
    if (d.pressTimer !== null) {
      clearTimeout(d.pressTimer);
      d.pressTimer = null;
      // Переключаем режим
      setRecMode((m) => m === 'voice' ? 'circle' : 'voice');
      return;
    }

    // Долгое нажатие завершилось
    if (pttState === 'locked') return; // в фиксации не останавливаем
    if (pttState === 'recording') {
      stopVoicePTT(!d.cancelMode && !showCancel);
    }
  }, [pttState, showCancel, stopVoicePTT]);

  // ─── Видео-кружок ────────────────────────────────────────────────────────────

  const handleCircleRecorded = useCallback(async (blob: Blob, duration: number, thumbDataUrl: string) => {
    setShowCircle(false);
    setUploading(true);
    try {
      let thumbnailUrl: string | undefined;
      try {
        const res = await fetch(thumbDataUrl);
        const tb  = await res.blob();
        const tf  = new FormData();
        tf.append('file', tb, 'thumb.jpg');
        const { data: td } = await api.post('/media/upload/image', tf);
        thumbnailUrl = td.data.url;
      } catch {}

      const form = new FormData();
      form.append('file', blob, 'circle.webm');
      form.append('duration', String(Math.round(duration)));
      const { data } = await api.post('/media/upload/circle', form);
      const m = data.data;

      sendMessage({
        chatId, type: 'circle',
        mediaData: { url: m.url, thumbnailUrl, mimeType: m.mimeType, size: m.size, duration: Math.round(duration) },
      });
    } catch (err) {
      console.error('Circle upload failed', err);
      setUploadError('Не удалось отправить кружок');
      setTimeout(() => setUploadError(null), 3000);
    }
    finally { setUploading(false); }
  }, [chatId]);

  // ─── Видео-сообщение (запись через камеру) ──────────────────────────────────

  const handleVideoRecorded = useCallback(async (blob: Blob, duration: number, thumbDataUrl: string) => {
    setShowVideoRec(false);
    if (blob.size > 100 * 1024 * 1024) {
      setUploadError('Видео слишком большое (макс. 100 МБ)');
      setTimeout(() => setUploadError(null), 3000);
      return;
    }
    setUploading(true);
    try {
      // 1. Загружаем превью-кадр (poster)
      let thumbnailUrl: string | undefined;
      try {
        const res = await fetch(thumbDataUrl);
        const tb  = await res.blob();
        const tf  = new FormData();
        tf.append('file', tb, 'thumb.jpg');
        const { data: td } = await api.post('/media/upload/image', tf);
        thumbnailUrl = td.data.url;
      } catch { /* poster — необязательный */ }

      // 2. Загружаем само видео
      const form = new FormData();
      form.append('file', blob, 'video.webm');
      const { data } = await api.post('/media/upload/video', form);
      const m = data.data;

      sendMessage({
        chatId,
        type: 'video',
        mediaData: {
          url: m.url, thumbnailUrl, mimeType: m.mimeType, size: m.size,
          duration: Math.max(1, Math.round(duration)),
          width: m.width, height: m.height,
        },
      });
    } catch (err) {
      console.error('Video upload failed', err);
      setUploadError('Не удалось отправить видео');
      setTimeout(() => setUploadError(null), 3000);
    } finally { setUploading(false); }
  }, [chatId]);

  // ─── Файл (фото / видео) ──────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Лимит 100 МБ для видео
    if (type === 'video' && file.size > 100 * 1024 * 1024) {
      setUploadError('Видео слишком большое (макс. 100 МБ)');
      setTimeout(() => setUploadError(null), 3000);
      e.target.value = '';
      return;
    }
    setPendingMedia({ file, type, previewUrl: URL.createObjectURL(file) });
    setShowAttach(false);
    e.target.value = '';
  };

  const handleMediaSend = useCallback(async (caption?: string) => {
    if (!pendingMedia) return;
    const { file, type, previewUrl } = pendingMedia;
    URL.revokeObjectURL(previewUrl);
    setPendingMedia(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(`/media/upload/${type}`, form);
      const m = data.data;
      sendMessage({ chatId, type: type as MessageType, content: caption || undefined,
        mediaData: { url: m.url, mimeType: m.mimeType, size: m.size, width: m.width, height: m.height } });
    } catch (err) { console.error('Media upload failed', err); }
    finally { setUploading(false); }
  }, [chatId, pendingMedia]);

  const handleMediaCancel = useCallback(() => {
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
  }, [pendingMedia]);

  // ─── Вспомогалки ─────────────────────────────────────────────────────────────

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const isRecording = pttState !== 'idle';
  const hasText     = text.trim().length > 0;

  // ─── Рендер ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Fullscreen overlays */}
      <AnimatePresence>
        {showCircle && (
          <CircleRecorder onRecorded={handleCircleRecorded} onCancel={() => setShowCircle(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showVideoRec && (
          <VideoRecorder onRecorded={handleVideoRecorded} onCancel={() => setShowVideoRec(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pendingMedia && (
          <MediaPreview media={pendingMedia} onSend={handleMediaSend} onCancel={handleMediaCancel} />
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFileChange(e, 'image')} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
        onChange={(e) => handleFileChange(e, 'video')} />

      {/* ─── Основная панель ─── */}
      <div className="flex-shrink-0 border-t border-white/[0.05] bg-dark-surface/70 backdrop-blur-xl px-4 pt-3 pb-3 pb-input">

        {/* Планка «Ответить» */}
        <AnimatePresence>
          {replyingTo && !editingMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-3 bg-dark-hover rounded-xl px-3 py-2 mb-2 border-l-2 border-primary-500 overflow-hidden"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-primary-400 font-medium truncate">↩ {replyingTo.sender?.displayName ?? 'Ответить'}</p>
                <p className="text-xs text-white/50 truncate">
                  {formatReplyPreview(replyingTo as any) || '📎 Медиафайл'}
                </p>
              </div>
              <button onClick={() => setReplyingTo(null)} className="text-white/40 hover:text-white flex-shrink-0">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Планка «Редактировать» */}
        <AnimatePresence>
          {editingMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-3 bg-primary-600/10 rounded-xl px-3 py-2 mb-2 border-l-2 border-primary-500 overflow-hidden"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-primary-400 font-medium">✏ Редактирование</p>
                <p className="text-xs text-white/50 truncate">{editingMessage.content}</p>
              </div>
              <button onClick={() => { setEditingMsg(null); setText(''); }} className="text-white/40 hover:text-white flex-shrink-0">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Загрузка */}
        <AnimatePresence>
          {uploading && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-2 bg-primary-600/10 border border-primary-600/20 rounded-xl px-4 py-2.5 mb-3">
              <div className="w-3.5 h-3.5 border-2 border-primary-400/50 border-t-primary-400 rounded-full animate-spin flex-shrink-0" />
              <span className="text-sm text-primary-400">Загрузка медиа...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ошибка загрузки */}
        <AnimatePresence>
          {uploadError && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 mb-3">
              <span className="text-sm text-red-400">{uploadError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">

          {/* ── Кнопка прикрепить (скрыта при записи) ── */}
          {!isRecording && (
            <div className="relative flex-shrink-0">
              <IconBtn onClick={() => setShowAttach(!showAttach)} disabled={uploading} active={showAttach}>
                <Paperclip size={20} />
              </IconBtn>

              <Dropdown
                open={showAttach}
                onClose={() => setShowAttach(false)}
                anchor="left"
                className="!bottom-full !top-auto !mb-2 !mt-0"
              >
                <DropdownItem
                  icon={<ImageIcon size={16} />} label="Фото"
                  onClick={() => { imageInputRef.current?.click(); setShowAttach(false); }}
                />
                <DropdownItem
                  icon={<Video size={16} />} label="Снять видео"
                  onClick={() => { setShowVideoRec(true); setShowAttach(false); }}
                />
                <DropdownItem
                  icon={<Video size={16} />} label="Видео (файл)"
                  onClick={() => { videoInputRef.current?.click(); setShowAttach(false); }}
                />
                <DropdownItem
                  icon={<CircleDot size={16} />} label="Видео-кружок"
                  onClick={() => { setShowCircle(true); setShowAttach(false); }}
                />
              </Dropdown>
            </div>
          )}

          {/* ── Центральная зона ── */}
          <div className="relative flex-1">
          <AnimatePresence>
            {mention && !isRecording && (
              <MentionAutocomplete
                chatId={chatId}
                query={mention.query}
                onSelect={insertMention}
                onClose={() => setMention(null)}
              />
            )}
          </AnimatePresence>
          <div className={clsx(
            'rounded-3xl overflow-hidden',
            'bg-white/[0.04] border border-white/[0.07] backdrop-blur-sm',
            !isRecording && 'focus-within:border-primary-500/60 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:bg-white/[0.06]',
          )}>
            {/* Обычный ввод текста */}
            {!isRecording && (
              <div className="px-3 py-2 flex items-end gap-1 relative">
                {/* Эмодзи кнопка */}
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setShowEmoji((v) => !v)}
                    disabled={uploading}
                    className="btn-icon btn-icon-sm text-white/40 hover:text-white/80"
                  >
                    <Smile size={18} />
                  </button>
                  <AnimatePresence>
                    {showEmoji && (
                      <EmojiPicker
                        onSelect={(emoji) => {
                          setText((t) => t + emoji);
                          textareaRef.current?.focus();
                        }}
                        onClose={() => setShowEmoji(false)}
                      />
                    )}
                  </AnimatePresence>
                </div>

                <textarea
                  ref={textareaRef}
                  className="flex-1 bg-transparent text-white placeholder-white/30 outline-none resize-none text-sm leading-relaxed max-h-[120px] py-1.5"
                  placeholder="Сообщение..."
                  rows={1}
                  value={text}
                  disabled={uploading}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  onSelect={(e) => {
                    const ta = e.currentTarget;
                    setMention(detectMention(ta.value, ta.selectionStart ?? 0));
                  }}
                />
              </div>
            )}

            {/* PTT: идёт запись (НЕ зафиксировано) */}
            {pttState === 'recording' && (
              <div className="flex items-center gap-2 px-3 py-2.5 h-[46px]">
                {/* Отмена при свайпе влево */}
                <motion.span
                  animate={{ opacity: showCancel ? 1 : 0.35, x: showCancel ? 0 : 4 }}
                  className="text-xs text-white/50 flex-shrink-0 select-none whitespace-nowrap"
                >
                  ← отмена
                </motion.span>

                {/* Waveform */}
                <div className="flex-1 flex items-center gap-[2px] h-7">
                  {pttBars.map((h, i) => (
                    <div key={i} className="flex-1 rounded-full bg-red-400 transition-all duration-75"
                      style={{ height: `${Math.max(3, h * 24)}px`, opacity: 0.5 + h * 0.5 }} />
                  ))}
                </div>

                {/* Таймер */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-white/70 tabular-nums font-medium">{fmt(pttTime)}</span>
                </div>

                {/* Замок — подсказка потянуть вверх */}
                <motion.div
                  animate={{ opacity: 0.3 + lockProgress * 0.7, scale: 0.9 + lockProgress * 0.2 }}
                  className="flex flex-col items-center flex-shrink-0"
                >
                  <Lock size={12} className={clsx('transition-colors', lockProgress > 0.5 ? 'text-primary-400' : 'text-white/40')} />
                  <span className="text-[9px] text-white/30 leading-none">↑</span>
                </motion.div>
              </div>
            )}

            {/* PTT: зафиксировано */}
            {pttState === 'locked' && (
              <div className="flex items-center gap-2 px-3 py-2.5 h-[46px]">
                {/* Отмена */}
                <button onClick={() => stopVoicePTT(false)}
                  className="w-7 h-7 rounded-full bg-dark-hover hover:bg-red-500/20 flex items-center justify-center flex-shrink-0 transition-colors">
                  <X size={14} className="text-white/60" />
                </button>

                {/* Waveform */}
                <div className="flex-1 flex items-center gap-[2px] h-7">
                  {pttBars.map((h, i) => (
                    <div key={i} className="flex-1 rounded-full bg-primary-400 transition-all duration-75"
                      style={{ height: `${Math.max(3, h * 24)}px`, opacity: 0.5 + h * 0.5 }} />
                  ))}
                </div>

                {/* Таймер */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-primary-300 tabular-nums font-medium">{fmt(pttTime)}</span>
                </div>
              </div>
            )}
          </div>
          </div>

          {/* ── Правая кнопка ── */}
          {/* Текст → градиентная кнопка отправки */}
          {hasText && !isRecording && (
            <motion.button
              onClick={handleSend}
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-gradient text-white shadow-glow-violet"
            >
              <Send size={18} />
            </motion.button>
          )}

          {/* Нет текста → единая кнопка PTT (idle + recording — один DOM-элемент, чтобы pointer capture не терялся) */}
          {!hasText && pttState !== 'locked' && (
            <button
              onPointerDown={onRecBtnDown}
              onPointerMove={onRecBtnMove}
              onPointerUp={onRecBtnUp}
              onPointerCancel={onRecBtnUp}
              disabled={uploading}
              title={pttState === 'idle'
                ? (recMode === 'voice' ? 'Зажми для записи, тап — переключить на кружок' : 'Зажми для записи, тап — переключить на голос')
                : 'Отпусти для отправки / тап — остановить'}
              className={clsx(
                'w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 select-none touch-none',
                pttState === 'recording'
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse-glow'
                  : recMode === 'voice'
                  ? 'bg-white/[0.06] hover:bg-white/[0.1] text-white/65 hover:text-white border border-white/[0.06]'
                  : 'bg-white/[0.06] hover:bg-white/[0.1] text-primary-300 hover:text-primary-200 border border-white/[0.06]',
                uploading && 'opacity-40 cursor-not-allowed',
              )}
            >
              {pttState === 'recording'
                ? <Mic size={18} />
                : recMode === 'voice' ? <Mic size={18} /> : <CircleDot size={18} />}
            </button>
          )}

          {/* Зафиксировано → градиентная кнопка отправки */}
          {!hasText && pttState === 'locked' && (
            <motion.button
              onClick={() => stopVoicePTT(true)}
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-gradient text-white shadow-glow-violet"
            >
              <Send size={18} />
            </motion.button>
          )}
        </div>

      </div>
    </>
  );
}
