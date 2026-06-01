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

// ─── Tile per-participant ─────────────────────────────────────────────────────
interface TileProps {
  participant: Participant;
  isLocal:     boolean;
}

function ParticipantTile({ participant, isLocal }: TileProps) {
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

  const name = participant.name || participant.identity;
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      className={`relative aspect-video rounded-2xl overflow-hidden bg-dark-card border transition-all ${
        isSpeaking ? 'border-primary-500 shadow-lg shadow-primary-500/30' : 'border-white/[0.06]'
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
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-dark-surface to-dark-bg">
          <div className="w-16 h-16 rounded-full bg-brand-gradient flex items-center justify-center text-white text-xl font-semibold">
            {initials || '?'}
          </div>
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}

      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
        <span className="text-xs text-white font-medium bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg truncate">
          {name}{isLocal && ' (вы)'}
        </span>
        {muted && (
          <span className="w-6 h-6 rounded-full bg-red-500/80 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <MicOff size={12} className="text-white" />
          </span>
        )}
      </div>
    </div>
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="fixed inset-0 z-[300] flex flex-col bg-dark-bg"
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-dark-surface/70 backdrop-blur-xl pt-[calc(var(--sat)+0.75rem)]">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base truncate">{group.chatName}</h2>
            <p className="text-xs text-white/50 mt-0.5">
              {error ? (
                <span className="text-red-400">{error}</span>
              ) : (
                <>Групповой звонок · {fmt(callTimer)} · {total} участник{total === 1 ? '' : total < 5 ? 'а' : 'ов'}</>
              )}
            </p>
          </div>
          <button
            onClick={handleMinimize}
            title="Свернуть"
            className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/70 hover:text-white transition-all"
          >
            <Minimize2 size={18} />
          </button>
        </div>

        {/* ── Participants grid ── */}
        <div className="flex-1 overflow-auto p-4">
          {total === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/50">
                <div className="w-12 h-12 rounded-full border-2 border-primary-500/40 border-t-primary-500 animate-spin" />
                <p className="text-sm">Подключение к звонку...</p>
              </div>
            </div>
          ) : (
            <div
              className="grid gap-3 h-full"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {allTiles.map(({ p, isLocal }) => (
                <ParticipantTile key={p.sid || p.identity} participant={p} isLocal={isLocal} />
              ))}
            </div>
          )}
        </div>

        {/* ── Controls ── */}
        <div className="flex items-center justify-center gap-4 px-4 py-6 border-t border-white/[0.06] bg-dark-surface/70 backdrop-blur-xl pb-[calc(var(--sab)+1.5rem)]">
          <button
            onClick={toggleMic}
            title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              micOn
                ? 'bg-dark-hover text-white/80 hover:text-white'
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}
          >
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button
            onClick={toggleCam}
            title={camOn ? 'Выключить камеру' : 'Включить камеру'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              camOn
                ? 'bg-dark-hover text-white/80 hover:text-white'
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}
          >
            {camOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          <button
            onClick={handleLeave}
            title="Завершить звонок"
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all"
          >
            <PhoneOff size={22} className="text-white" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
