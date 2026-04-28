import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, PhoneOff, ChevronDown } from 'lucide-react';
import { useCallStore } from '@/stores/call.store';
import { useAuthStore } from '@/stores/auth.store';
import { joinGroupCall, leaveGroupCall, sendCallSignal } from '@/lib/socket';
import Avatar from '@/components/ui/Avatar';

const TURN_URL  = import.meta.env.VITE_TURN_URL  as string | undefined;
const TURN_USER = import.meta.env.VITE_TURN_USER as string | undefined;
const TURN_PASS = import.meta.env.VITE_TURN_PASS as string | undefined;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(TURN_URL && TURN_USER && TURN_PASS
    ? [{ urls: `turn:${TURN_URL}`, username: TURN_USER, credential: TURN_PASS }]
    : []),
];

export default function GroupCallOverlay() {
  const groupCall        = useCallStore((s) => s.groupCall);
  const addParticipant   = useCallStore((s) => s.addParticipant);
  const removeParticipant = useCallStore((s) => s.removeParticipant);
  const updateParticipantStream = useCallStore((s) => s.updateParticipantStream);
  const clearGroupCall   = useCallStore((s) => s.clearGroupCall);
  const myUserId         = useAuthStore((s) => s.user?.id);

  // Map of peerId -> RTCPeerConnection
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef  = useRef<MediaStream | null>(null);
  const localVideoRef   = useRef<HTMLVideoElement>(null);

  // Remote streams keyed by peerId
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const iceCandidateQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteDescReady    = useRef<Map<string, boolean>>(new Map());

  const [muted,     setMuted]     = useState(false);
  const [camOff,    setCamOff]    = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [joined,    setJoined]    = useState(false);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const createPeerConnection = useCallback((peerId: string, callId: string, isInitiator: boolean) => {
    const existing = peerConnections.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        const stream = e.streams[0];
        updateParticipantStream(peerId, stream);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(peerId, stream);
          return next;
        });
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) sendCallSignal(callId, e.candidate.toJSON());
    };

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        pc.addTrack(t, localStreamRef.current!);
      });
    }

    peerConnections.current.set(peerId, pc);
    iceCandidateQueues.current.set(peerId, []);
    remoteDescReady.current.set(peerId, false);

    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: groupCall?.callType === 'video' })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (pc.localDescription) sendCallSignal(callId, pc.localDescription);
        })
        .catch(() => {/* ignore */});
    }

    return pc;
  }, [groupCall?.callType, updateParticipantStream]);

  const tearDown = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    iceCandidateQueues.current.clear();
    remoteDescReady.current.clear();
    setRemoteStreams(new Map());
    setCallTimer(0);
    setMuted(false);
    setCamOff(false);
    setMinimized(false);
    setJoined(false);
  }, []);

  const handleJoin = useCallback(async () => {
    if (!groupCall) return;

    // Get media
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: groupCall.callType === 'video'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        : false,
    }).catch(() => null);

    if (stream) {
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    }

    // Signal server we're joining
    joinGroupCall(groupCall.callId, groupCall.chatId);
    setJoined(true);

    // Start timer
    timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);

    // Create peer connections to all existing participants
    groupCall.participants.forEach((p) => {
      if (p.userId !== myUserId) {
        createPeerConnection(p.userId, groupCall.callId, true);
      }
    });
  }, [groupCall, myUserId, createPeerConnection]);

  const handleLeave = useCallback(() => {
    if (groupCall) leaveGroupCall(groupCall.callId);
    tearDown();
    clearGroupCall();
  }, [groupCall, tearDown, clearGroupCall]);

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMuted((m) => !m);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCamOff((c) => !c);
  };

  // Handle new peer joining
  useEffect(() => {
    const handler = (e: Event) => {
      const { callId, peerId } = (e as CustomEvent).detail as { callId: string; peerId: string; peerName: string; peerAvatar?: string };
      if (!groupCall || groupCall.callId !== callId) return;
      if (!joined || peerId === myUserId) return;
      // New peer joined: they will send us an offer (they are initiator toward us)
      // We just create the pc and wait for their offer via call:signal
      createPeerConnection(peerId, callId, false);
    };
    window.addEventListener('call:peer-joined', handler);
    return () => window.removeEventListener('call:peer-joined', handler);
  }, [groupCall, joined, myUserId, createPeerConnection]);

  // Handle peer leaving
  useEffect(() => {
    const handler = (e: Event) => {
      const { callId, peerId } = (e as CustomEvent).detail as { callId: string; peerId: string };
      if (!groupCall || groupCall.callId !== callId) return;
      const pc = peerConnections.current.get(peerId);
      if (pc) { pc.close(); peerConnections.current.delete(peerId); }
      iceCandidateQueues.current.delete(peerId);
      remoteDescReady.current.delete(peerId);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
      removeParticipant(peerId);
    };
    window.addEventListener('call:peer-left', handler);
    return () => window.removeEventListener('call:peer-left', handler);
  }, [groupCall, removeParticipant]);

  // Handle WebRTC signaling for group calls
  useEffect(() => {
    const handler = async (e: Event) => {
      const { callId, signal } = (e as CustomEvent).detail as {
        callId: string;
        signal: (RTCSessionDescriptionInit | RTCIceCandidateInit) & { fromPeerId?: string };
      };
      if (!groupCall || groupCall.callId !== callId) return;

      // We need to know which peer this signal is from.
      // The signal event detail should include peerId from socket server.
      const peerId = (signal as Record<string, unknown>).fromPeerId as string | undefined;
      if (!peerId) return;

      let pc = peerConnections.current.get(peerId);
      if (!pc) {
        pc = createPeerConnection(peerId, callId, false);
      }

      if ('type' in signal && (signal.type === 'offer' || signal.type === 'answer')) {
        await pc.setRemoteDescription(signal as RTCSessionDescriptionInit);
        remoteDescReady.current.set(peerId, true);

        const queue = iceCandidateQueues.current.get(peerId) ?? [];
        for (const c of queue) {
          try { await pc.addIceCandidate(c); } catch { /* ignore */ }
        }
        iceCandidateQueues.current.set(peerId, []);

        if (signal.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendCallSignal(callId, answer);
        }
      } else {
        if (remoteDescReady.current.get(peerId)) {
          try { await pc.addIceCandidate(signal as RTCIceCandidateInit); } catch { /* ignore */ }
        } else {
          const queue = iceCandidateQueues.current.get(peerId) ?? [];
          queue.push(signal as RTCIceCandidateInit);
          iceCandidateQueues.current.set(peerId, queue);
        }
      }
    };
    window.addEventListener('call:group-signal', handler);
    return () => window.removeEventListener('call:group-signal', handler);
  }, [groupCall, createPeerConnection]);

  // Cleanup on unmount
  useEffect(() => () => { tearDown(); }, [tearDown]);

  if (!groupCall) return null;

  const participants = groupCall.participants.filter((p) => p.userId !== myUserId);
  const totalCount   = participants.length + 1; // +1 for self
  const gridCols     = totalCount <= 2 ? 'grid-cols-1' : totalCount <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  if (minimized && joined) {
    return (
      <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-3 bg-dark-card border border-dark-border rounded-full px-4 py-2.5 shadow-2xl">
        <span className="text-xs font-medium text-white/60">{totalCount} участников</span>
        <span className="text-sm font-semibold tabular-nums">{fmt(callTimer)}</span>
        <button onClick={toggleMute}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${muted ? 'bg-red-500/20 text-red-400' : 'bg-dark-hover text-white/60 hover:text-white'}`}>
          {muted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button onClick={handleLeave}
          className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all">
          <PhoneOff size={14} className="text-white" />
        </button>
        <button onClick={() => setMinimized(false)}
          className="w-8 h-8 rounded-full bg-dark-hover flex items-center justify-center text-white/60 hover:text-white transition-all">
          <ChevronDown size={14} className="rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="fixed inset-0 z-[300] flex flex-col bg-dark-bg"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-black/40 flex-shrink-0">
          <div>
            <p className="font-semibold text-sm">Групповой звонок</p>
            <p className="text-xs text-white/50">{totalCount} участников · {fmt(callTimer)}</p>
          </div>
          {joined && (
            <button onClick={() => setMinimized(true)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all">
              <ChevronDown size={16} />
            </button>
          )}
        </div>

        {/* Video grid */}
        <div className={`flex-1 grid ${gridCols} gap-2 p-4 overflow-hidden`}>
          {/* Self tile */}
          <div className="relative rounded-2xl overflow-hidden bg-dark-card flex items-center justify-center">
            {groupCall.callType === 'video' && !camOff
              ? <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              : <Avatar src={undefined} name="Вы" size="xl" />
            }
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-xs">Вы</div>
            {muted && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center">
                <MicOff size={12} className="text-white" />
              </div>
            )}
          </div>

          {/* Remote tiles */}
          {participants.map((p) => {
            const stream = remoteStreams.get(p.userId);
            return (
              <div key={p.userId} className="relative rounded-2xl overflow-hidden bg-dark-card flex items-center justify-center">
                {stream && groupCall.callType === 'video'
                  ? <RemoteVideo stream={stream} />
                  : <Avatar src={p.avatar} name={p.name} size="xl" />
                }
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-xs truncate max-w-[80%]">{p.name}</div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 px-6 py-6 bg-black/40 flex-shrink-0">
          {!joined ? (
            <>
              <button onClick={handleLeave}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all">
                <PhoneOff size={20} className="text-white" />
              </button>
              <button onClick={handleJoin}
                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all">
                <Mic size={20} className="text-white" />
              </button>
            </>
          ) : (
            <>
              <button onClick={toggleMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  muted ? 'bg-red-500/20 border border-red-500/50 text-red-400' : 'bg-dark-hover text-white/60 hover:text-white'
                }`}>
                {muted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              {groupCall.callType === 'video' && (
                <button onClick={toggleCam}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    camOff ? 'bg-red-500/20 border border-red-500/50 text-red-400' : 'bg-dark-hover text-white/60 hover:text-white'
                  }`}>
                  {camOff ? <VideoOff size={18} /> : <Video size={18} />}
                </button>
              )}
              <button onClick={handleLeave}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all">
                <PhoneOff size={20} className="text-white" />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Helper component to attach stream to video element
function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />;
}
