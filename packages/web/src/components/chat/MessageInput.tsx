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
import { encryptText, isChatE2E, getRecipientPublicKey } from '@/lib/e2e';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { editMessage as socketEditMsg } from '@/lib/socket';
import CircleRecorder from '@/components/media/CircleRecorder';
import MediaPreview, { type PendingMedia } from '@/components/media/MediaPreview';
import EmojiPicker from '@/components/ui/EmojiPicker';
import type { MessageType } from '@messenger/shared';

interface Props { chatId: string; }

const BAR_COUNT = 30;

export default function MessageInput({ chatId }: Props) {
  const [text,         setText]         = useState('');
  const [showAttach,   setShowAttach]   = useState(false);
  const [showEmoji,    setShowEmoji]    = useState(false);
  const [showCircle,   setShowCircle]   = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState<string | null>(null);

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

    if (chat && user && privateKey && isChatE2E(chat)) {
      const recipientPub = getRecipientPublicKey(chat, user.id);
      if (recipientPub) {
        try {
          const { ciphertext, nonce } = await encryptText(chatId, t, recipientPub, privateKey);
          sendMessage({ chatId, type: 'text', content: ciphertext, nonce, encrypted: true, replyToId });
          return;
        } catch (err) {
          console.error('[E2E] Encryption failed, falling back to plaintext', err);
        }
      }
    }

    sendMessage({ chatId, type: 'text', content: t, replyToId });
  }, [chatId, text, editingMessage, replyingTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

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

  // ─── Файл (фото / видео) ──────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        {pendingMedia && (
          <MediaPreview media={pendingMedia} onSend={handleMediaSend} onCancel={handleMediaCancel} />
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFileChange(e, 'image')} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => handleFileChange(e, 'video')} />

      {/* ─── Основная панель ─── */}
      <div className="flex-shrink-0 border-t border-dark-border bg-dark-surface px-4 py-3">

        {/* Планка «Ответить» */}
        <AnimatePresence>
          {replyingTo && !editingMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-3 bg-dark-hover rounded-xl px-3 py-2 mb-2 border-l-2 border-primary-500 overflow-hidden"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-primary-400 font-medium">↩ {replyingTo.sender?.displayName ?? 'Ответить'}</p>
                <p className="text-xs text-white/50 truncate">{replyingTo.content ?? '📎 Медиафайл'}</p>
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
              <button
                onClick={() => setShowAttach(!showAttach)}
                disabled={uploading}
                className="p-2.5 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white disabled:opacity-40"
              >
                <Paperclip size={20} />
              </button>

              <AnimatePresence>
                {showAttach && (
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 8 }}
                    className="absolute bottom-12 left-0 bg-dark-card border border-dark-border rounded-xl overflow-hidden shadow-xl z-10 min-w-[160px]">
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors"
                      onClick={() => { imageInputRef.current?.click(); setShowAttach(false); }}>
                      <ImageIcon size={18} className="text-primary-400" /><span className="text-sm">Фото</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors"
                      onClick={() => { videoInputRef.current?.click(); setShowAttach(false); }}>
                      <Video size={18} className="text-primary-400" /><span className="text-sm">Видео</span>
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors"
                      onClick={() => { setShowCircle(true); setShowAttach(false); }}>
                      <CircleDot size={18} className="text-primary-400" /><span className="text-sm">Видео-кружок</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── Центральная зона ── */}
          <div className={clsx(
            'flex-1 rounded-2xl transition-all overflow-hidden',
            isRecording
              ? 'bg-dark-bg border border-dark-border'
              : 'bg-dark-bg border border-dark-border',
          )}>
            {/* Обычный ввод текста */}
            {!isRecording && (
              <div className="px-3 py-2.5 flex items-end gap-1.5 relative">
                {/* Эмодзи кнопка */}
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setShowEmoji((v) => !v)}
                    disabled={uploading}
                    className="p-1.5 rounded-lg hover:bg-dark-hover transition-colors text-white/40 hover:text-white/70"
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
                  className="flex-1 bg-transparent text-white placeholder-white/30 outline-none resize-none text-sm leading-relaxed max-h-[120px]"
                  placeholder="Сообщение..."
                  rows={1}
                  value={text}
                  disabled={uploading}
                  onChange={(e) => { setText(e.target.value); handleTyping(); }}
                  onKeyDown={handleKeyDown}
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

          {/* ── Правая кнопка ── */}
          {/* Текст → синяя кнопка отправки */}
          {hasText && !isRecording && (
            <button onClick={handleSend}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-primary-600 hover:bg-primary-500 text-white transition-all">
              <Send size={18} />
            </button>
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
                'w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all select-none touch-none',
                pttState === 'recording'
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 animate-pulse'
                  : recMode === 'voice'
                  ? 'bg-dark-card hover:bg-dark-hover text-white/60 hover:text-white'
                  : 'bg-dark-card hover:bg-dark-hover text-primary-400 hover:text-primary-300',
                uploading && 'opacity-40 cursor-not-allowed',
              )}
            >
              {pttState === 'recording'
                ? <Mic size={18} />
                : recMode === 'voice' ? <Mic size={18} /> : <CircleDot size={18} />}
            </button>
          )}

          {/* Зафиксировано → синяя кнопка отправки */}
          {!hasText && pttState === 'locked' && (
            <button onClick={() => stopVoicePTT(true)}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-600/30 transition-all">
              <Send size={18} />
            </button>
          )}
        </div>

      </div>
    </>
  );
}
