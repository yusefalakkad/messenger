/**
 * GroupCallView — UI для групповых звонков через LiveKit SFU.
 *
 * Полностью отдельный от 1-на-1 CallOverlay компонент. Открывается из ChatHeader
 * группового чата по кнопке "Групповой звонок". Активный звонок хранится в
 * useCallStore.group; пока он есть — рендерится либо полноэкранный grid
 * (minimized=false), либо ничего (minimized=true; пилл-индикатор отдельно в
 * Sidebar).
 *
 * Поток подключения:
 *   1. user жмёт "Групповой звонок" → POST /api/livekit/token { chatId }
 *   2. backend возвращает { token, url, room }
 *   3. new Room().connect(url, token)
 *   4. localParticipant.setMicrophoneEnabled(true)
 *   5. UI обновляется на каждом ParticipantConnected/Disconnected/TrackSubscribed
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Minimize2,
} from 'lucide-react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalParticipant,
  type Participant,
} from 'livekit-client';
import { useCallStore } from '@/stores/call.store';
import { useChatStore } from '@/stores/chat.store';
import { SPRING, popIn, tap } from '@/lib/motion';
import Avatar from '@/components/ui/Avatar';

// ─── Tile per-participant ─────────────────────────────────────────────────────
interface TileProps {
  participant: Participant;
  isLocal:     boolean;
  chatId:      string;
}

function ParticipantTile({ participant, isLocal, chatId }: TileProps) {
  // identity = userId (бэк подставляет userId как identity при выдаче LiveKit-токена).
  // Через chat-store достаём реальную аватарку/имя.
  const member = useChatStore((s) => {
    const chat = s.chats.find((c) => c.id === chatId);
    return chat?.members.find((m) => m.userId === participant.identity);
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasVideo,   setHasVideo]   = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted,      setMuted]      = useState(false);

  useEffect(() => {
    const attach = () => {
      const videoPub = participant.getTrackPublication(Track.Source.Camera);
      const audioPub = participant.getTrackPublication(Track.Source.Microphone);

      if (videoPub?.track && videoRef.current) {
        videoPub.track.attach(videoRef.current);
        setHasVideo(!videoPub.isMuted);
      } else {
        setHasVideo(false);
      }

      // Local audio не аттачим — слышим себя только через мониторинг (не делаем).
      if (audioPub?.track && audioRef.current && !isLocal) {
        audioPub.track.attach(audioRef.current);
      }

      setMuted(audioPub?.isMuted ?? false);
    };

    attach();

    const onSpeaking = () => setIsSpeaking(participant.isSpeaking);
    const onMute     = () => attach();

    participant.on('isSpeakingChanged' as any, onSpeaking);
    participant.on('trackMuted' as any, onMute);
    participant.on('trackUnmuted' as any, onMute);
    participant.on('trackSubscribed' as any, onMute);
    participant.on('trackUnsubscribed' as any, onMute);
    participant.on('trackPublished' as any, onMute);
    participant.on('trackUnpublished' as any, onMute);

    return () => {
      participant.off('isSpeakingChanged' as any, onSpeaking);
      participant.off('trackMuted' as any, onMute);
      participant.off('trackUnmuted' as any, onMute);
      participant.off('trackSubscribed' as any, onMute);
      participant.off('trackUnsubscribed' as any, onMute);
      participant.off('trackPublished' as any, onMute);
      participant.off('trackUnpublished' as any, onMute);

      const videoPub = participant.getTrackPublication(Track.Source.Camera);
      const audioPub = participant.getTrackPublication(Track.Source.Microphone);
      if (videoPub?.track && videoRef.current) videoPub.track.detach(videoRef.current);
      if (audioPub?.track && audioRef.current) audioPub.track.detach(audioRef.current);
    };
  }, [participant, isLocal]);

  const name   = member?.user.displayName ?? participant.name ?? participant.identity;
  const avatar = member?.user.avatar;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING.smooth}
      className={`relative aspect-video rounded-2xl overflow-hidden bg-dark-card border-2 transition-colors duration-200 ${
        isSpeaking ? 'border-primary-500 shadow-glow-violet' : 'border-dark-border shadow-e2'
      }`}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-radial bg-dark-card">
          {/* Реальная аватарка пира (если есть в chat-store), иначе initials в брендовом круге.
              Размер скейлится с тайлом — на узком 1-col экране ~80px, на 3-col ~48px. */}
          <div className={`w-[28%] aspect-square min-w-[44px] max-w-[88px] rounded-full ${isSpeaking ? 'shadow-glow-violet' : ''}`}>
            <Avatar src={avatar} name={name ?? '?'} size="xl" />
          </div>
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}

      {/* Подпись имени — gradient overlay снизу, не перекрывает контент.
          mute-индикатор слева от имени, видимая зона для truncate. */}
      <div className="absolute bottom-0 inset-x-0 px-2.5 pt-7 pb-2 flex items-center gap-1.5 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none">
        {muted && (
          <span className="w-5 h-5 rounded-full bg-red-500/85 flex items-center justify-center flex-shrink-0">
            <MicOff size={11} className="text-white" />
          </span>
        )}
        <span className="text-[12px] text-white font-medium truncate flex-1 min-w-0">
          {name}{isLocal && ' (вы)'}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Main GroupCallView ───────────────────────────────────────────────────────
export default function GroupCallView() {
  const group              = useCallStore((s) => s.group);
  const setGroupMinimized  = useCallStore((s) => s.setGroupMinimized);
  const clearGroupCall     = useCallStore((s) => s.clearGroupCall);

  const roomRef = useRef<Room | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [micOn,  setMicOn]  = useState(true);
  const [camOn,  setCamOn]  = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Connect to LiveKit ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!group) return;

    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    const updateParticipants = () => {
      setParticipants(Array.from(room.remoteParticipants.values()));
    };

    room
      .on(RoomEvent.ParticipantConnected, updateParticipants)
      .on(RoomEvent.ParticipantDisconnected, updateParticipants)
      .on(RoomEvent.TrackSubscribed,
        (_t: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => updateParticipants())
      .on(RoomEvent.TrackUnsubscribed, () => updateParticipants())
      .on(RoomEvent.Disconnected, () => {
        if (!cancelled) clearGroupCall();
      });

    (async () => {
      try {
        await room.connect(group.url, group.token);
        if (cancelled) { await room.disconnect(); return; }
        setLocalParticipant(room.localParticipant);
        // Микрофон включаем сразу. Камеру — нет (пользователь сам жмёт).
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicOn(true);
        updateParticipants();
        timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
      } catch (err) {
        console.error('[livekit] connect failed', err);
        setError(err instanceof Error ? err.message : 'Не удалось подключиться');
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      room.disconnect().catch(() => {});
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.chatId]);

  const toggleMic = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = !micOn;
    await lp.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = !camOn;
    await lp.setCameraEnabled(next);
    setCamOn(next);
  }, [camOn]);

  const handleLeave = useCallback(() => {
    roomRef.current?.disconnect().catch(() => {});
    clearGroupCall();
  }, [clearGroupCall]);

  const handleMinimize = useCallback(() => {
    setGroupMinimized(true);
  }, [setGroupMinimized]);

  if (!group || group.minimized) return null;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const allTiles: Array<{ p: Participant; isLocal: boolean }> = [
    ...(localParticipant ? [{ p: localParticipant, isLocal: true }] : []),
    ...participants.map((p) => ({ p, isLocal: false })),
  ];
  const total = allTiles.length;
  // Grid columns: 1, 2, 2, 3, 3, 3, 4, 4 для total=1..8
  const cols = total <= 1 ? 1 : total <= 4 ? 2 : total <= 6 ? 3 : 4;

  return (
    <AnimatePresence>
      <motion.div
        variants={popIn} initial="hidden" animate="visible" exit="exit"
        className="fixed inset-0 z-call flex flex-col bg-dark-bg"
      >
        {/* ── Header (h-16 по системе, единый dark-border, единая ChatHeader-структура) ── */}
        <div className="flex items-center gap-3 px-4 h-16 pt-[var(--sat)] border-b border-dark-border bg-dark-surface/80 backdrop-blur-xl flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h4 className="truncate">{group.chatName}</h4>
            <p className="text-[12px] leading-4 text-white/50 mt-0.5 truncate tabular-nums">
              {error ? (
                <span className="text-red-400">{error}</span>
              ) : (
                <>Групповой звонок · {fmt(callTimer)} · {total} {pluralRu(total, 'участник', 'участника', 'участников')}</>
              )}
            </p>
          </div>
          <motion.button
            onClick={handleMinimize}
            whileTap={tap} whileHover={{ scale: 1.06 }} transition={SPRING.snappy}
            title="Свернуть"
            aria-label="Свернуть звонок"
            className="w-10 h-10 rounded-lg glass flex items-center justify-center text-white/70 hover:text-white transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <Minimize2 size={18} />
          </motion.button>
        </div>

        {/* ── Participants grid ── */}
        <div className="flex-1 overflow-auto p-4">
          {total === 0 ? (
            <div className="h-full flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.smooth}
                className="flex flex-col items-center gap-4 text-center"
              >
                <div className="w-20 h-20 rounded-2xl bg-brand-gradient-soft border border-primary-500/30 flex items-center justify-center shadow-glow-violet animate-pulse-glow">
                  <span className="w-9 h-9 rounded-full border-2 border-primary-400/40 border-t-primary-400 animate-spin" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold">Подключение к звонку</p>
                  <p className="text-[13px] text-white/50 mt-1">Ждём участников…</p>
                </div>
              </motion.div>
            </div>
          ) : (
            <div
              className="grid gap-3 h-full"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {allTiles.map(({ p, isLocal }) => (
                <ParticipantTile key={p.sid || p.identity} participant={p} isLocal={isLocal} chatId={group.chatId} />
              ))}
            </div>
          )}
        </div>

        {/* ── Controls (mic/cam = 56px hit-target; leave = 64px primary action) ── */}
        <div className="flex items-center justify-center gap-5 px-4 py-5 border-t border-dark-border bg-dark-surface/80 backdrop-blur-xl pb-[calc(var(--sab)+1.25rem)] flex-shrink-0">
          <motion.button
            onClick={toggleMic}
            whileTap={tap} whileHover={{ scale: 1.06 }} transition={SPRING.snappy}
            title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
            aria-label={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
              micOn
                ? 'glass text-white/85 hover:text-white'
                : 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/25'
            }`}
          >
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </motion.button>

          <motion.button
            onClick={toggleCam}
            whileTap={tap} whileHover={{ scale: 1.06 }} transition={SPRING.snappy}
            title={camOn ? 'Выключить камеру' : 'Включить камеру'}
            aria-label={camOn ? 'Выключить камеру' : 'Включить камеру'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
              camOn
                ? 'glass text-white/85 hover:text-white'
                : 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/25'
            }`}
          >
            {camOn ? <Video size={20} /> : <VideoOff size={20} />}
          </motion.button>

          <motion.button
            onClick={handleLeave}
            whileTap={tap} whileHover={{ scale: 1.05 }} transition={SPRING.snappy}
            title="Завершить звонок"
            aria-label="Завершить звонок"
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-e3 shadow-red-500/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
          >
            <PhoneOff size={22} className="text-white" />
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Русская плюрализация: 1 участник, 2 участника, 5 участников.
// 11..14 — всегда родительный мн. (одиннадцать участников).
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
