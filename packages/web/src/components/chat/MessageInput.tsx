/**
 * Панель ввода.
 * • Текст → Enter или кнопка Send
 * • Голос / Кружок — переключаются коротким тапом на кнопку
 * • Зажать кнопку → запись сразу; отпустить → отправить
 * • Зажать и потянуть ВВЕРХ → фиксация записи (продолжает без удержания)
 * • В фиксированном режиме: × отмена, ✓ отправить
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Paperclip, Mic, Send, Image as ImageIcon, Video, Camera, Film, CircleDot, X, Lock, Smile, Trash2, BarChart3, ImagePlay } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { SPRING, EASE, tap } from '@/lib/motion';
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
import GifPicker from '@/components/media/GifPicker';
import ScheduleSendSheet from '@/components/chat/ScheduleSendSheet';
import PollCreateModal from '@/components/chat/PollCreateModal';
import MediaPreview, { type PendingMedia } from '@/components/media/MediaPreview';
import EmojiPicker from '@/components/ui/EmojiPicker';
import IconBtn from '@/components/ui/IconBtn';
import Dropdown, { DropdownItem, DropdownDivider } from '@/components/ui/Dropdown';
import MentionAutocomplete from './MentionAutocomplete';
import type { MessageType } from '@messenger/shared';

interface Props { chatId: string; }

const BAR_COUNT = 30;

// Отмена через AbortController (axios CanceledError / DOM AbortError) — не ошибка
const isAbortError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string } | null;
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

export default function MessageInput({ chatId }: Props) {
  const [text,         setText]         = useState('');
  const [showAttach,   setShowAttach]   = useState(false);
  const [showEmoji,    setShowEmoji]    = useState(false);
  const [showCircle,   setShowCircle]   = useState(false);
  const [showVideoRec, setShowVideoRec] = useState(false);
  const [showPoll,     setShowPoll]     = useState(false);
  const [showGif,      setShowGif]      = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  // Прогресс активной загрузки (0..100) и упавшая загрузка для «Повторить»
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [failedUpload,   setFailedUpload]   = useState<{ form: FormData; retry: () => void } | null>(null);

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
  const draftSyncRef   = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce PUT черновика на сервер
  const imageInputRef  = useRef<HTMLInputElement>(null);
  const videoInputRef  = useRef<HTMLInputElement>(null);
  const abortRef       = useRef<AbortController | null>(null); // активная загрузка медиа

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
  // P1-16: ключ scoped per-user (`draft:<userId>:<chatId>`) чтобы при logout/login
  // в одной вкладке черновики юзера A не утекали юзеру B. resetAppState() при
  // logout всё равно чистит draft:* — это второй слой защиты.

  const myUserIdForDraft = useAuthStore((s) => s.user?.id);
  const draftKey = myUserIdForDraft ? `draft:${myUserIdForDraft}:${chatId}` : null;

  useEffect(() => {
    if (editingMessage || !draftKey) return;
    const draft = localStorage.getItem(draftKey);
    if (draft !== null) { setText(draft); return; }
    // localStorage пуст — fallback на серверный черновик (self-обогащение chat.draft из listUserChats)
    const serverDraft = useChatStore.getState().chats.find((c) => c.id === chatId)?.draft;
    if (serverDraft) {
      setText(serverDraft);
      localStorage.setItem(draftKey, serverDraft);
    } else {
      setText('');
    }
  }, [chatId, draftKey]);

  useEffect(() => {
    if (editingMessage || !draftKey) return;
    const t = text.trim();
    if (t) localStorage.setItem(draftKey, text);
    else   localStorage.removeItem(draftKey);
    // Синк на сервер: debounce 1500мс, fire-and-forget; cleanup отменяет
    // таймер при новом вводе / смене чата / unmount.
    draftSyncRef.current = setTimeout(() => {
      draftSyncRef.current = null;
      api.put(`/chats/${chatId}/draft`, { text: t || null }).catch(() => {});
    }, 1500);
    return () => {
      if (draftSyncRef.current) { clearTimeout(draftSyncRef.current); draftSyncRef.current = null; }
    };
  }, [text, chatId, draftKey, editingMessage]);

  // ─── Медленный режим ─────────────────────────────────────────────────────────
  // Для роли member в чате со slowModeSeconds: после успешной отправки текста
  // запускаем локальный countdown — вместо кнопки отправки тикает кружок mm:ss.
  // Owner/admin освобождены (сервер их тоже не троттлит).

  const slowModeSeconds = useChatStore((s) => s.chats.find((c) => c.id === chatId)?.slowModeSeconds ?? null);
  const myRole = useChatStore((s) =>
    s.chats.find((c) => c.id === chatId)?.members.find((m) => m.userId === myUserIdForDraft)?.role,
  );
  const slowSeconds = slowModeSeconds && myRole === 'member' ? slowModeSeconds : null;

  const [slowUntilTs, setSlowUntilTs] = useState<number | null>(null); // timestamp конца countdown
  const [slowLeft,    setSlowLeft]    = useState(0);                   // осталось секунд (для рендера)

  // Сброс countdown при смене чата; и если режим выключили/роль изменилась — тоже
  useEffect(() => { setSlowUntilTs(null); setSlowLeft(0); }, [chatId]);
  useEffect(() => {
    if (!slowSeconds) { setSlowUntilTs(null); setSlowLeft(0); }
  }, [slowSeconds]);

  // Тикающий секундомер: пересчитываем остаток от timestamp (не дрейфует)
  useEffect(() => {
    if (!slowUntilTs) return;
    const tick = () => {
      const left = Math.ceil((slowUntilTs - Date.now()) / 1000);
      if (left <= 0) { setSlowUntilTs(null); setSlowLeft(0); }
      else setSlowLeft(left);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [slowUntilTs]);

  const slowActive = slowUntilTs !== null;

  const startSlowCountdown = useCallback(() => {
    if (!slowSeconds) return;
    setSlowLeft(slowSeconds);
    setSlowUntilTs(Date.now() + slowSeconds * 1000);
  }, [slowSeconds]);

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
    // Медленный режим: пока тикает countdown — не отправляем (Enter в обход кнопки).
    // Редактирование не считается новым сообщением и не троттлится.
    if (!editingMessage && slowUntilTs !== null) { haptic.error?.(); return; }
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
        startSlowCountdown();
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
    startSlowCountdown();
  }, [chatId, text, editingMessage, replyingTo, slowUntilTs, startSlowCountdown]);

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

  // ─── Загрузка медиа: общий helper с прогрессом и отменой ────────────────────

  /** POST /media/upload/<type> с onUploadProgress и AbortController. Возвращает data.data. */
  const uploadWithProgress = useCallback(async (form: FormData, type: string) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setUploadProgress(0);
    try {
      const { data } = await api.post(`/media/upload/${type}`, form, {
        signal: ctrl.signal,
        onUploadProgress: (e) => setUploadProgress(Math.round((e.loaded / (e.total || 1)) * 100)),
      });
      return data.data;
    } finally {
      abortRef.current = null;
    }
  }, []);

  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
        const form = new FormData();
        form.append('file', blob, 'voice.webm');
        form.append('duration', String(Math.max(1, duration)));
        form.append('waveform', JSON.stringify(finalBars));
        // Замыкание — «Повторить» гоняет ту же цепочку upload+send заново
        const doUpload = async () => {
          setFailedUpload(null);
          setUploading(true);
          try {
            const m = await uploadWithProgress(form, 'voice');
            sendMessage({
              chatId,
              type: 'voice',
              mediaData: {
                url: m.url, mimeType: m.mimeType, size: m.size,
                duration: Math.max(1, duration), waveform: finalBars,
              },
            });
          } catch (err) {
            if (isAbortError(err)) return; // отменено пользователем
            console.error('Voice upload failed', err);
            setFailedUpload({ form, retry: doUpload });
          }
          finally { setUploading(false); setUploadProgress(null); }
        };
        await doUpload();
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
    const form = new FormData();
    form.append('file', blob, 'circle.webm');
    form.append('duration', String(Math.round(duration)));

    const doUpload = async () => {
      setFailedUpload(null);
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

        const m = await uploadWithProgress(form, 'circle');

        sendMessage({
          chatId, type: 'circle',
          mediaData: { url: m.url, thumbnailUrl, mimeType: m.mimeType, size: m.size, duration: Math.round(duration) },
        });
      } catch (err) {
        if (isAbortError(err)) return;
        console.error('Circle upload failed', err);
        setFailedUpload({ form, retry: doUpload });
      }
      finally { setUploading(false); setUploadProgress(null); }
    };
    await doUpload();
  }, [chatId, uploadWithProgress]);

  // ─── Видео-сообщение (запись через камеру) ──────────────────────────────────

  const handleVideoRecorded = useCallback(async (blob: Blob, duration: number, thumbDataUrl: string) => {
    setShowVideoRec(false);
    if (blob.size > 100 * 1024 * 1024) {
      setUploadError('Видео слишком большое (макс. 100 МБ)');
      setTimeout(() => setUploadError(null), 3000);
      return;
    }
    const form = new FormData();
    form.append('file', blob, 'video.webm');

    const doUpload = async () => {
      setFailedUpload(null);
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
        const m = await uploadWithProgress(form, 'video');

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
        if (isAbortError(err)) return;
        console.error('Video upload failed', err);
        setFailedUpload({ form, retry: doUpload });
      } finally { setUploading(false); setUploadProgress(null); }
    };
    await doUpload();
  }, [chatId, uploadWithProgress]);

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

  const handleMediaSend = useCallback(async (caption?: string, viewOnce?: boolean) => {
    if (!pendingMedia) return;
    const { file, type, previewUrl } = pendingMedia;
    URL.revokeObjectURL(previewUrl);
    setPendingMedia(null);

    const form = new FormData();
    form.append('file', file);

    // Вся цепочка upload+send в замыкании — «Повторить» запускает её заново,
    // файл живёт в form/closure до успеха или отмены.
    const doUpload = async () => {
      setFailedUpload(null);
      setUploading(true);
      try {
        const m = await uploadWithProgress(form, type);

        // P1-6: для видео-файла генерим poster + извлекаем dimensions/duration.
        // Без этого в пузырьке показывается серый плейсхолдер без длительности.
        let videoThumbnailUrl: string | undefined;
        let videoWidth: number | undefined;
        let videoHeight: number | undefined;
        let videoDuration: number | undefined;
        if (type === 'video') {
          try {
            const meta = await extractVideoPoster(file);
            videoWidth    = meta.width;
            videoHeight   = meta.height;
            videoDuration = meta.duration;
            if (meta.posterBlob) {
              const tf = new FormData();
              tf.append('file', meta.posterBlob, 'poster.jpg');
              const { data: td } = await api.post('/media/upload/image', tf);
              videoThumbnailUrl = td.data.url;
            }
          } catch (err) {
            console.warn('[Video] poster extraction failed, sending without', err);
          }
        }

        // P1-15: caption в E2E-чате должен идти зашифрованным, иначе sidebar
        // светит подпись в открытом виде, а сервер видит «секрет».
        const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
        const { user, privateKey } = useAuthStore.getState();
        let captionContent: string | undefined = caption || undefined;
        let captionNonce:    string | undefined;
        let captionEncrypted = false;

        if (caption && chat && isChatE2E(chat) && user && privateKey) {
          const recipientPub = getRecipientPublicKey(chat, user.id);
          if (recipientPub) {
            try {
              const enc = await encryptText(chatId, caption, recipientPub, privateKey);
              captionContent   = enc.ciphertext;
              captionNonce     = enc.nonce;
              captionEncrypted = true;
            } catch (err) {
              console.error('[E2E] Caption encrypt failed — sending without caption', err);
              toast.error('Не удалось зашифровать подпись. Отправляем без неё.');
              captionContent = undefined; // лучше без подписи, чем светить plaintext
            }
          }
        }

        sendMessage({
          chatId,
          type: type as MessageType,
          content: captionContent,
          nonce: captionNonce,
          encrypted: captionEncrypted,
          // Одноразовый просмотр («1×») — сервер примет только при наличии mediaData
          viewOnce: viewOnce || undefined,
          mediaData: {
            url: m.url,
            mimeType: m.mimeType,
            size: m.size,
            width:        videoWidth     ?? m.width,
            height:       videoHeight    ?? m.height,
            duration:     videoDuration,
            thumbnailUrl: videoThumbnailUrl,
          },
        });
      } catch (err) {
        if (isAbortError(err)) return;
        console.error('Media upload failed', err);
        setFailedUpload({ form, retry: doUpload });
      }
      finally { setUploading(false); setUploadProgress(null); }
    };
    await doUpload();
  }, [chatId, pendingMedia, uploadWithProgress]);

  const handleMediaCancel = useCallback(() => {
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
  }, [pendingMedia]);

  // P2-3: revoke pending blob URL при unmount / смене чата — иначе блоб 100MB
  // видео висит в памяти браузера всё время сессии.
  useEffect(() => {
    return () => {
      if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    };
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Вспомогалки ─────────────────────────────────────────────────────────────

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // mm:ss для кружка медленного режима
  const fmtSlow = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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
      <AnimatePresence>
        {showPoll && (
          <PollCreateModal chatId={chatId} onClose={() => setShowPoll(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSchedule && (
          <ScheduleSendSheet
            onClose={() => setShowSchedule(false)}
            onPick={async (d) => {
              const t = text.trim();
              setShowSchedule(false);
              if (!t) return;
              try {
                await api.post('/messages/schedule', {
                  chatId, sendAt: d.toISOString(), type: 'text', content: t,
                });
                setText('');
                toast.success('Запланировано');
              } catch (err) {
                console.error('Schedule failed', err);
                toast.error('Не удалось запланировать отправку');
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFileChange(e, 'image')} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => handleFileChange(e, 'video')} />

      {/* ─── Основная панель (8-grid: px-16, py-12, border единый dark-border) ─── */}
      <div className="flex-shrink-0 border-t border-dark-border bg-dark-surface/80 backdrop-blur-xl px-4 pt-3 pb-input">

        {/* Планка «Ответить» — surface-1 + brand-полоска слева */}
        <AnimatePresence>
          {replyingTo && !editingMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE.soft }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 surface-1 rounded-xl pl-0 pr-3 py-2 mb-2 overflow-hidden">
                <span className="w-[3px] self-stretch rounded-full bg-brand-gradient flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-primary-600 dark:text-primary-300 font-medium truncate">↩ {replyingTo.sender?.displayName ?? 'Ответить'}</p>
                  <p className="text-[12px] text-content/45 truncate">
                    {formatReplyPreview(replyingTo as any) || '📎 Медиафайл'}
                  </p>
                </div>
                <motion.button whileTap={tap} transition={SPRING.snappy}
                  onClick={() => setReplyingTo(null)} className="btn-icon btn-icon-sm text-content/45 hover:text-content flex-shrink-0">
                  <X size={16} />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Планка «Редактировать» — surface-1 + brand-полоска слева */}
        <AnimatePresence>
          {editingMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE.soft }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 surface-1 rounded-xl pl-0 pr-3 py-2 mb-2 overflow-hidden">
                <span className="w-[3px] self-stretch rounded-full bg-brand-gradient flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-primary-600 dark:text-primary-300 font-medium">✏ Редактирование</p>
                  <p className="text-[12px] text-content/45 truncate">{editingMessage.content}</p>
                </div>
                <motion.button whileTap={tap} transition={SPRING.snappy}
                  onClick={() => { setEditingMsg(null); setText(''); }} className="btn-icon btn-icon-sm text-content/45 hover:text-content flex-shrink-0">
                  <X size={16} />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Загрузка: спиннер + % + прогресс-бар + X (отмена) */}
        <AnimatePresence>
          {uploading && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE.soft }}
              className="overflow-hidden">
              <div className="surface-1 rounded-xl px-4 py-2.5 mb-2.5 overflow-hidden">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 border-2 border-primary-400/50 border-t-primary-400 rounded-full animate-spin flex-shrink-0" />
                  <span className="text-[13px] text-primary-600 dark:text-primary-300 flex-1 min-w-0 truncate">Загрузка медиа...</span>
                  {uploadProgress !== null && (
                    <span className="text-[12px] text-primary-600 dark:text-primary-300 tabular-nums flex-shrink-0">{uploadProgress}%</span>
                  )}
                  <button onClick={cancelUpload} aria-label="Отменить загрузку"
                    className="btn-icon btn-icon-sm text-content/45 hover:text-content flex-shrink-0">
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-2 h-1 rounded-full bg-content/[0.06] overflow-hidden">
                  <div className="h-1 rounded-full bg-brand-gradient transition-all duration-200"
                    style={{ width: `${uploadProgress ?? 0}%` }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Упавшая загрузка: «Повторить» + X (файл живёт в failedUpload до успеха/отмены) */}
        <AnimatePresence>
          {failedUpload && !uploading && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE.soft }}
              className="overflow-hidden">
              <div className="flex items-center gap-2 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-4 py-2.5 mb-2.5 overflow-hidden">
                <span className="text-[13px] text-rose-600 dark:text-rose-300 flex-1 min-w-0 truncate">Не удалось загрузить медиа</span>
                <motion.button whileTap={tap} transition={SPRING.snappy} onClick={() => failedUpload.retry()}
                  className="px-2.5 h-8 rounded-lg text-[13px] font-medium text-rose-600 dark:text-rose-200 hover:bg-rose-500/15 transition-colors flex-shrink-0">
                  Повторить
                </motion.button>
                <button onClick={() => setFailedUpload(null)} aria-label="Закрыть"
                  className="btn-icon btn-icon-sm text-content/45 hover:text-content flex-shrink-0">
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ошибка загрузки (лимиты размера и пр.) */}
        <AnimatePresence>
          {uploadError && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE.soft }}
              className="overflow-hidden">
              <div className="flex items-center gap-2 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-4 py-2.5 mb-2.5">
                <span className="text-[13px] text-rose-600 dark:text-rose-300">{uploadError}</span>
              </div>
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
                className="!bottom-full !top-auto !mb-2 !mt-0 min-w-[200px]"
              >
                {/* Группировка: запись с камеры → файлы из галереи. */}
                <DropdownItem
                  icon={<Camera size={16} />} label="Снять видео"
                  onClick={() => { setShowVideoRec(true); setShowAttach(false); }}
                />
                <DropdownItem
                  icon={<CircleDot size={16} />} label="Видео-кружок"
                  onClick={() => { setShowCircle(true); setShowAttach(false); }}
                />
                <DropdownDivider />
                <DropdownItem
                  icon={<ImageIcon size={16} />} label="Фото из галереи"
                  onClick={() => { imageInputRef.current?.click(); setShowAttach(false); }}
                />
                <DropdownItem
                  icon={<Film size={16} />} label="Видео-файл"
                  onClick={() => { videoInputRef.current?.click(); setShowAttach(false); }}
                />
                <DropdownDivider />
                <DropdownItem
                  icon={<BarChart3 size={16} />} label="Опрос"
                  onClick={() => { setShowPoll(true); setShowAttach(false); }}
                />
                <DropdownItem
                  icon={<ImagePlay size={16} />} label="GIF"
                  onClick={() => { setShowGif(true); setShowAttach(false); }}
                />
              </Dropdown>

              {/* GIF-пикер — absolute bottom-full над кнопкой прикрепления */}
              <AnimatePresence>
                {showGif && (
                  <GifPicker
                    onSelect={(gif) => {
                      sendMessage({
                        chatId,
                        type: 'image',
                        mediaData: {
                          url: gif.url, mimeType: 'image/gif', size: 0,
                          width: gif.width, height: gif.height,
                        },
                      });
                    }}
                    onClose={() => setShowGif(false)}
                  />
                )}
              </AnimatePresence>
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
            'rounded-3xl transition-colors duration-200',
            'bg-content/[0.04] border border-dark-border backdrop-blur-sm',
            !isRecording && 'focus-within:border-primary-500/50 focus-within:ring-2 focus-within:ring-primary-500/15 focus-within:bg-content/[0.06]',
          )}>
            {/* Обычный ввод текста */}
            {!isRecording && (
              <div className="px-3 py-2 flex items-end gap-1 relative">
                {/* Эмодзи кнопка */}
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setShowEmoji((v) => !v)}
                    disabled={uploading}
                    className="btn-icon btn-icon-sm text-content/40 hover:text-content/80"
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
                  className="flex-1 bg-transparent text-content placeholder-content/30 outline-none resize-none text-sm leading-relaxed max-h-[120px] py-1.5"
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
              <div className="flex items-center gap-2 px-3 h-11">
                {/* Свайп-индикатор отмены: иконка корзины + подпись, краснеют по мере drag */}
                <motion.div
                  animate={{
                    opacity: showCancel ? 1 : 0.55,
                    scale:   showCancel ? 1.08 : 1,
                    x:       showCancel ? -4 : 0,
                  }}
                  transition={{ duration: 0.15 }}
                  className={clsx(
                    'flex items-center gap-1.5 flex-shrink-0 select-none whitespace-nowrap',
                    showCancel ? 'text-red-400' : 'text-content/55',
                  )}
                >
                  <Trash2 size={14} />
                  <span className="text-[12px] font-medium">{showCancel ? 'отпусти' : '← отмена'}</span>
                </motion.div>

                {/* Waveform */}
                <div className="flex-1 flex items-center gap-[2px] h-7 min-w-0">
                  {pttBars.map((h, i) => (
                    <div key={i} className={clsx(
                      'flex-1 rounded-full transition-all duration-75',
                      showCancel ? 'bg-red-300/70' : 'bg-red-400',
                    )}
                      style={{ height: `${Math.max(3, h * 24)}px`, opacity: 0.5 + h * 0.5 }} />
                  ))}
                </div>

                {/* Таймер */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[12px] text-content/75 tabular-nums font-medium">{fmt(pttTime)}</span>
                </div>

                {/* Замок — подсказка потянуть вверх */}
                <motion.div
                  animate={{ opacity: 0.4 + lockProgress * 0.6, scale: 0.9 + lockProgress * 0.25 }}
                  className="flex flex-col items-center justify-center flex-shrink-0 w-6"
                  title="Потяните вверх для фиксации"
                >
                  <span className="text-[10px] leading-none text-content/40">↑</span>
                  <Lock size={13} className={clsx('transition-colors mt-0.5', lockProgress > 0.5 ? 'text-primary-400' : 'text-content/45')} />
                </motion.div>
              </div>
            )}

            {/* PTT: зафиксировано — можно отпустить кнопку */}
            {pttState === 'locked' && (
              <div className="flex items-center gap-2 px-3 h-11">
                {/* Отмена 36×36 для hit-target ≥ 32 */}
                <button onClick={() => stopVoicePTT(false)}
                  aria-label="Отменить запись"
                  className="w-9 h-9 rounded-full bg-dark-hover hover:bg-red-500/20 flex items-center justify-center flex-shrink-0 text-content/70 hover:text-red-300 transition-colors">
                  <Trash2 size={16} />
                </button>

                {/* Waveform — primary тон, фиксированная запись */}
                <div className="flex-1 flex items-center gap-[2px] h-7 min-w-0">
                  {pttBars.map((h, i) => (
                    <div key={i} className="flex-1 rounded-full bg-primary-400 transition-all duration-75"
                      style={{ height: `${Math.max(3, h * 24)}px`, opacity: 0.5 + h * 0.5 }} />
                  ))}
                </div>

                {/* Таймер */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[12px] text-primary-500 dark:text-primary-200 tabular-nums font-medium">{fmt(pttTime)}</span>
                </div>
              </div>
            )}
          </div>
          </div>

          {/* ── Правая кнопка ── */}
          {/* Медленный режим: countdown вместо кнопки отправки (textarea не блокируем) */}
          {hasText && !isRecording && slowActive && !editingMessage && (
            <button
              disabled
              title="Медленный режим: подождите перед следующим сообщением"
              className="w-11 h-11 rounded-full border border-dark-border flex items-center justify-center flex-shrink-0 cursor-not-allowed"
            >
              <span className="text-[11px] tabular-nums text-content/60">{fmtSlow(slowLeft)}</span>
            </button>
          )}

          {/* Текст → градиентная кнопка отправки */}
          {hasText && !isRecording && !(slowActive && !editingMessage) && (
            <motion.button
              onClick={handleSend}
              onContextMenu={(e) => { e.preventDefault(); setShowSchedule(true); }}
              title="ПКМ — отправить позже"
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING.snappy}
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
                'w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 select-none touch-none transition-colors duration-200',
                pttState === 'recording'
                  ? 'bg-rose-500 text-white shadow-e2 shadow-rose-500/40 animate-pulse-glow'
                  : recMode === 'voice'
                  ? 'bg-content/[0.06] hover:bg-content/[0.1] text-content/65 hover:text-content border border-dark-border'
                  : 'bg-content/[0.06] hover:bg-content/[0.1] text-primary-600 dark:text-primary-300 hover:text-primary-500 dark:hover:text-primary-200 border border-dark-border',
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
              transition={SPRING.snappy}
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

/**
 * Извлекает poster-кадр + dimensions + duration из видео-файла.
 * Скрытый <video> в DOM не нужен — создаём оффскрин-элемент.
 * Используется в handleMediaSend для type='video' (P1-6).
 */
function extractVideoPoster(file: File): Promise<{
  posterBlob: Blob | null;
  width: number;
  height: number;
  duration: number;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload  = 'metadata';
    video.muted    = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => { URL.revokeObjectURL(url); video.src = ''; };

    let metaLoaded = false;
    video.onloadedmetadata = () => {
      metaLoaded = true;
      // Seek на ~1 секунду (или половину длительности у коротких видео) — обычно
      // даёт более характерный кадр, чем первый чёрный фрейм.
      const seekTo = Math.min(1, Math.max(0.1, video.duration / 2));
      try { video.currentTime = seekTo; } catch { /* ignore */ }
    };

    video.onseeked = () => {
      if (!metaLoaded) return;
      try {
        const w = video.videoWidth, h = video.videoHeight;
        const canvas = document.createElement('canvas');
        // Cap до 720p для разумного размера postera.
        const scale = Math.min(1, 720 / Math.max(w, h, 1));
        canvas.width  = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); resolve({ posterBlob: null, width: w, height: h, duration: video.duration }); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          resolve({ posterBlob: blob, width: w, height: h, duration: video.duration });
        }, 'image/jpeg', 0.8);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => { cleanup(); reject(new Error('Video load failed')); };
    // Хард-timeout — если видео-codec не поддерживается, onerror не всегда срабатывает.
    setTimeout(() => { if (!metaLoaded) { cleanup(); reject(new Error('Video metadata timeout')); } }, 10_000);
  });
}
