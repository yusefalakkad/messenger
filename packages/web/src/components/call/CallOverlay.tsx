import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react';
import { useCallStore } from '@/stores/call.store';
import { acceptCall, rejectCall, endCall, sendCallSignal } from '@/lib/socket';
import { getIceServers } from '@/lib/iceServers';
import Avatar from '@/components/ui/Avatar';

export default function CallOverlay() {
  const incoming  = useCallStore((s) => s.incoming);
  const active    = useCallStore((s) => s.active);
  const outgoing  = useCallStore((s) => s.outgoing);
  const clearCall = useCallStore((s) => s.clearCall);
  const setActive = useCallStore((s) => s.setActive);

  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Remote stream через state — надёжнее чем прямое назначение в ontrack
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // ICE candidate queue — кандидаты могут прийти до setRemoteDescription
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescReady   = useRef(false);

  const [muted,     setMuted]     = useState(false);
  const [camOff,    setCamOff]    = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Назначаем remote stream на элементы после рендера
  useEffect(() => {
    if (!remoteStream) return;
    if (active?.callType === 'video' && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    } else if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, active?.callType]);

  const tearDown = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    iceCandidateQueue.current = [];
    remoteDescReady.current = false;
    setRemoteStream(null);
    setCallTimer(0);
    setMuted(false);
    setCamOff(false);
  }, []);

  const startPeer = useCallback(async (callId: string, callType: 'audio' | 'video', isInitiator: boolean) => {
    iceCandidateQueue.current = [];
    remoteDescReady.current = false;

    // Динамически получаем ICE-серверы (STUN + TURN) с бэка с кэшем 10 мин
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    }).catch(() => null);

    if (stream) {
      localStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    }

    // Используем setState — React сам назначит stream на элементы после рендера
    pc.ontrack = (e) => {
      if (e.streams[0]) setRemoteStream(e.streams[0]);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) sendCallSignal(callId, e.candidate.toJSON());
    };

    if (isInitiator) {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await pc.setLocalDescription(offer);
      sendCallSignal(callId, offer);
    }

    timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
  }, []);

  useEffect(() => {
    const handler = async (e: Event) => {
      const { callId, signal } = (e as CustomEvent).detail as {
        callId: string;
        signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
      };
      const pc = pcRef.current;
      if (!pc) return;
      if (useCallStore.getState().active?.callId !== callId) return;

      if ('type' in signal && (signal.type === 'offer' || signal.type === 'answer')) {
        await pc.setRemoteDescription(signal as RTCSessionDescriptionInit);
        remoteDescReady.current = true;

        for (const c of iceCandidateQueue.current) {
          try { await pc.addIceCandidate(c); } catch { /* ignore */ }
        }
        iceCandidateQueue.current = [];

        if (signal.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendCallSignal(callId, answer);
        }
      } else {
        if (remoteDescReady.current) {
          try { await pc.addIceCandidate(signal as RTCIceCandidateInit); } catch { /* ignore */ }
        } else {
          iceCandidateQueue.current.push(signal as RTCIceCandidateInit);
        }
      }
    };
    window.addEventListener('call:signal', handler);
    return () => window.removeEventListener('call:signal', handler);
  }, []);

  useEffect(() => {
    const handler = () => { tearDown(); clearCall(); };
    window.addEventListener('call:ended', handler);
    return () => window.removeEventListener('call:ended', handler);
  }, [tearDown, clearCall]);

  useEffect(() => {
    if (active) startPeer(active.callId, active.callType, active.isInitiator);
  }, [active?.callId]);

  const handleAccept = useCallback(async () => {
    if (!incoming) return;
    acceptCall(incoming.callId);
    setActive({
      callId:      incoming.callId,
      peerId:      incoming.callerId,
      chatId:      incoming.chatId,
      callType:    incoming.callType,
      startedAt:   new Date(),
      isInitiator: false,
    });
  }, [incoming, setActive]);

  const handleReject = useCallback(() => {
    if (!incoming) return;
    rejectCall(incoming.callId);
    clearCall();
  }, [incoming, clearCall]);

  const handleEnd = useCallback(() => {
    const callId = active?.callId ?? outgoing?.callId;
    if (callId) endCall(callId);
    tearDown();
    clearCall();
  }, [active, outgoing, tearDown, clearCall]);

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMuted((m) => !m);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCamOff((c) => !c);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const isVideo = active?.callType === 'video' || incoming?.callType === 'video' || outgoing?.callType === 'video';

  return (
    <AnimatePresence>
      {(incoming || active || outgoing) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed inset-0 z-[300] flex items-center justify-center"
        >
          {/* Скрытый audio для аудиозвонков (video элемент обрабатывает видеозвонки) */}
          <audio ref={remoteAudioRef} autoPlay playsInline />

          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          <div className={`relative flex flex-col items-center rounded-3xl overflow-hidden shadow-2xl ${
            isVideo && active
              ? 'w-full h-full max-w-lg max-h-[90vh] bg-dark-bg'
              : 'w-80 bg-dark-card border border-dark-border'
          }`}>

            {isVideo && active && (
              <>
                <video ref={remoteVideoRef} autoPlay playsInline
                  className="absolute inset-0 w-full h-full object-cover" />
                <video ref={localVideoRef} autoPlay playsInline muted
                  className={`absolute bottom-20 right-4 w-28 h-40 rounded-2xl object-cover border-2 border-white/20 z-10 ${camOff ? 'hidden' : ''}`} />
              </>
            )}

            <div className={`relative z-10 flex flex-col items-center p-8 gap-4 ${
              isVideo && active
                ? 'mt-auto w-full bg-gradient-to-t from-black/80 to-transparent pt-16 pb-8'
                : 'w-full'
            }`}>
              {!(isVideo && active) && (
                <>
                  <div className="relative">
                    <Avatar src={incoming?.callerAvatar} name={incoming?.callerName ?? 'Звонок'} size="xl" />
                    {(outgoing || active) && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-dark-card animate-pulse" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{incoming?.callerName ?? 'Звонок'}</p>
                    <p className="text-sm text-white/50">
                      {incoming && 'Входящий звонок...'}
                      {outgoing && 'Звоним...'}
                      {active && fmt(callTimer)}
                    </p>
                  </div>
                </>
              )}

              {isVideo && active && (
                <p className="text-sm text-white/70 self-center mb-2">{fmt(callTimer)}</p>
              )}

              <div className="flex items-center gap-4 mt-2">
                {incoming && (
                  <>
                    <button onClick={handleReject}
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all">
                      <PhoneOff size={22} className="text-white" />
                    </button>
                    <button onClick={handleAccept}
                      className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all">
                      <Phone size={22} className="text-white" />
                    </button>
                  </>
                )}
                {outgoing && (
                  <button onClick={handleEnd}
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all">
                    <PhoneOff size={22} className="text-white" />
                  </button>
                )}
                {active && (
                  <>
                    <button onClick={toggleMute}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                        muted ? 'bg-red-500/20 border border-red-500/50 text-red-400' : 'bg-dark-hover text-white/60 hover:text-white'
                      }`}>
                      {muted ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    {isVideo && (
                      <button onClick={toggleCam}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                          camOff ? 'bg-red-500/20 border border-red-500/50 text-red-400' : 'bg-dark-hover text-white/60 hover:text-white'
                        }`}>
                        {camOff ? <VideoOff size={18} /> : <Video size={18} />}
                      </button>
                    )}
                    {!isVideo && (
                      <button className="w-12 h-12 rounded-full bg-dark-hover flex items-center justify-center text-white/60">
                        <Volume2 size={18} />
                      </button>
                    )}
                    <button onClick={handleEnd}
                      className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all">
                      <PhoneOff size={20} className="text-white" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
