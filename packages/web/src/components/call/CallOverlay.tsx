import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, MonitorUp, MonitorOff, Minimize2, Maximize2 } from 'lucide-react';
import { SPRING, backdrop, popIn, tap } from '@/lib/motion';
import { useCallStore } from '@/stores/call.store';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { acceptCall, rejectCall, endCall, sendCallSignal } from '@/lib/socket';
import { getIceServers } from '@/lib/iceServers';
import { startRing, stopRing, startRingback, stopRingback } from '@/lib/notificationSound';
import { toast } from '@/lib/toast';
import Avatar from '@/components/ui/Avatar';

export default function CallOverlay() {
  const incoming  = useCallStore((s) => s.incoming);
  const active    = useCallStore((s) => s.active);
  const outgoing  = useCallStore((s) => s.outgoing);
  const clearCall = useCallStore((s) => s.clearCall);
  const setActive = useCallStore((s) => s.setActive);

  // Имя и аватар собеседника. Для входящего — берём из payload (бэк прислал
  // callerName/callerAvatar). Для исходящего/активного — находим peer в chat-store
  // (callStore хранит только id, без name/avatar).
  const chats = useChatStore((s) => s.chats);
  const myUserId = useAuthStore((s) => s.user?.id);
  const myAvatar = useAuthStore((s) => s.user?.avatar);
  const myName   = useAuthStore((s) => s.user?.displayName ?? s.user?.username ?? 'Я');
  let peerName  = 'Звонок';
  let peerAvatar: string | null | undefined;
  if (incoming) {
    peerName   = incoming.callerName ?? 'Звонок';
    peerAvatar = incoming.callerAvatar;
  } else {
    const chatId = outgoing?.chatId ?? active?.chatId;
    if (chatId) {
      const chat = chats.find((c) => c.id === chatId);
      const other = chat?.members.find((m) => m.userId !== myUserId);
      if (other) {
        peerName   = other.user.displayName ?? other.user.username ?? 'Собеседник';
        peerAvatar = other.user.avatar;
      }
    }
  }

  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Remote stream через state — надёжнее чем прямое назначение в ontrack
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // Активность remote-video трека: собеседник выключил камеру → false → показываем аватар.
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);

  // ICE candidate queue — кандидаты могут прийти до setRemoteDescription
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescReady   = useRef(false);
  // Buffer для offer/answer, если signal придёт ДО того, как startPeer успел
  // создать pc (race между setActive и useEffect, см. P0-1 в WEB_AUDIT_2026-06-10.md).
  const pendingSdpRef = useRef<RTCSessionDescriptionInit | null>(null);

  const [muted,     setMuted]     = useState(false);
  const [camOff,    setCamOff]    = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [sharingScreen, setSharingScreen] = useState(false);
  // Свёрнутый звонок: оверлей превращается в пилюлю в углу, звонок продолжается
  // (медиа-элементы остаются в DOM — аудио/видео не прерываются).
  const [minimized, setMinimized] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Свёрнутость сбрасываем, когда звонка нет (входящий не показываем свёрнутым).
  useEffect(() => { if (!active) setMinimized(false); }, [active]);

  // Сохраняем исходный камера-трек, чтобы вернуть его после остановки шеринга.
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  // Текущий displayMedia stream — нужен, чтобы остановить tracks при teardown.
  const screenStreamRef = useRef<MediaStream | null>(null);

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
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    cameraTrackRef.current = null;
    if (pcRef.current) {
      // Снимаем listener'ы явно — RTCPeerConnection держит их даже после close().
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
    }
    pcRef.current = null;
    iceCandidateQueue.current = [];
    pendingSdpRef.current = null;
    remoteDescReady.current = false;
    setRemoteStream(null);
    setRemoteVideoActive(false);
    setCallTimer(0);
    setMuted(false);
    setCamOff(false);
    setSharingScreen(false);
  }, []);

  const startPeer = useCallback(async (callId: string, callType: 'audio' | 'video', isInitiator: boolean) => {
    // Если предыдущий звонок не разобрали (back-to-back звонки) — почистить (P1-3).
    if (pcRef.current || localStreamRef.current) tearDown();

    iceCandidateQueue.current = [];
    remoteDescReady.current = false;

    // КРИТИЧНО (P0-1): создаём pc СИНХРОННО, ДО любых await — иначе offer от
    // другой стороны может прийти раньше, чем pcRef.current = pc, и сигнал-handler
    // его дропнет. ICE-серверы применим позже через setConfiguration().
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    // Listener'ы вешаем сразу. iceconnectionstatechange (P1-1) — внутри startPeer,
    // не в отдельном useEffect: тот эффект бэйлил раньше создания pc и больше не
    // перезапускался.
    pc.ontrack = (e) => {
      if (e.streams[0]) setRemoteStream(e.streams[0]);
      // Слушаем mute/unmute видеотрека удалённой стороны — собеседник выкл/вкл камеру.
      if (e.track.kind === 'video') {
        const t = e.track;
        const update = () => {
          if (pcRef.current !== pc) return;
          setRemoteVideoActive(!t.muted && t.readyState === 'live' && t.enabled);
        };
        update();
        t.addEventListener('mute',   update);
        t.addEventListener('unmute', update);
        t.addEventListener('ended',  update);
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) sendCallSignal(callId, e.candidate.toJSON());
    };
    pc.oniceconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      const st = pc.iceConnectionState;
      if (st === 'failed' || st === 'closed') {
        try { endCall(callId); } catch { /* ignore */ }
        tearDown();
        clearCall();
      }
    };

    // ICE-серверы догоняем — если getIceServers() медленный или упал, звонок
    // всё равно соберётся через дефолтный конфиг (default Google STUN'ы).
    try {
      const iceServers = await getIceServers();
      if (pcRef.current === pc) pc.setConfiguration({ iceServers });
    } catch { /* fall through with default config */ }
    if (pcRef.current !== pc) return; // звонок отменили пока ждали

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
    } catch (err) {
      // Микро/камера недоступны — пользователь должен это видеть, а не залипший экран.
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        toast.error(callType === 'video'
          ? 'Доступ к камере и микрофону запрещён. Разрешите в настройках браузера.'
          : 'Доступ к микрофону запрещён. Разрешите в настройках браузера.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        toast.error('Микрофон или камера не найдены');
      } else {
        toast.error('Не удалось получить доступ к устройствам ввода');
      }
      try { endCall(callId); } catch { /* ignore */ }
      tearDown();
      clearCall();
      return;
    }
    if (pcRef.current !== pc) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }

    if (stream) {
      localStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream!));
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    }

    // Если offer пришёл ДО того, как мы успели поднять треки (race на медленных
    // устройствах / первом разрешении камеры) — обрабатываем его сейчас, уже
    // с готовыми треками: ответ будет sendrecv, а не recvonly.
    if (pendingSdpRef.current) {
      const sdp = pendingSdpRef.current;
      pendingSdpRef.current = null;
      try {
        await pc.setRemoteDescription(sdp);
        remoteDescReady.current = true;
        for (const c of iceCandidateQueue.current) {
          try { await pc.addIceCandidate(c); } catch { /* ignore */ }
        }
        iceCandidateQueue.current = [];
        if (sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendCallSignal(callId, answer);
        }
      } catch { /* ignore — handler'ы могут досигналить */ }
    }

    if (isInitiator) {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      if (pcRef.current !== pc) return;
      await pc.setLocalDescription(offer);
      sendCallSignal(callId, offer);
    }

    timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
  }, [clearCall, tearDown]);

  useEffect(() => {
    const handler = async (e: Event) => {
      const { callId, signal } = (e as CustomEvent).detail as {
        callId: string;
        signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
      };
      if (useCallStore.getState().active?.callId !== callId) return;

      const pc = pcRef.current;
      const isSdp = 'type' in signal && (signal.type === 'offer' || signal.type === 'answer');

      // pc ещё не успели создать (callee на медленном устройстве, гонка между
      // setActive и useEffect → startPeer). Сохраняем offer/answer для startPeer.
      if (!pc) {
        if (isSdp) pendingSdpRef.current = signal as RTCSessionDescriptionInit;
        else       iceCandidateQueue.current.push(signal as RTCIceCandidateInit);
        return;
      }

      if (isSdp) {
        await pc.setRemoteDescription(signal as RTCSessionDescriptionInit);
        remoteDescReady.current = true;

        for (const c of iceCandidateQueue.current) {
          try { await pc.addIceCandidate(c); } catch { /* ignore */ }
        }
        iceCandidateQueue.current = [];

        if ((signal as RTCSessionDescriptionInit).type === 'offer') {
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
    const handler = () => { stopRing(); stopRingback(); tearDown(); clearCall(); };
    window.addEventListener('call:ended', handler);
    return () => window.removeEventListener('call:ended', handler);
  }, [tearDown, clearCall]);

  // Обратный гудок («ту… ту…») для звонящего, пока ждём ответа: outgoing уже
  // есть, но звонок ещё не active. Как только собеседник принял (active) или
  // звонок завершился (outgoing очищен) — cleanup гасит гудок.
  useEffect(() => {
    if (!outgoing || active) return;
    startRingback();
    return () => stopRingback();
  }, [outgoing?.callId, active]);

  // P1-5: incoming рингтон + системная нотификация (звонок в фоновой вкладке).
  // ring-start приходит из socket call:incoming handler; ring-stop — из call:ended,
  // accept или reject.
  useEffect(() => {
    const onStart = (e: Event) => {
      startRing();
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted'
            && document.visibilityState !== 'visible') {
          const detail = (e as CustomEvent).detail as { callerName?: string; callType?: string };
          new Notification('Входящий звонок', {
            body: detail?.callerName ?? 'Неизвестный абонент',
            tag: 'incoming-call',
            requireInteraction: true,
          });
        }
      } catch { /* notifications not supported */ }
    };
    const onStop = () => { stopRing(); stopRingback(); };
    window.addEventListener('call:ring-start', onStart);
    window.addEventListener('call:ring-stop',  onStop);
    return () => {
      window.removeEventListener('call:ring-start', onStart);
      window.removeEventListener('call:ring-stop',  onStop);
    };
  }, []);

  // Старт WebRTC для active звонка. Cleanup гарантирует teardown камеры/pc
  // при смене звонка (back-to-back, P1-3) или отмене.
  useEffect(() => {
    if (!active) return;
    startPeer(active.callId, active.callType, active.isInitiator);
    return () => { tearDown(); };
  }, [active?.callId, active?.callType, active?.isInitiator, startPeer, tearDown]);

  // Ring-timeout: если за 30s никто не ответил на исходящий — авто-end.
  // Без этого outgoing висит навсегда, юзер не понимает что собеседник недоступен.
  useEffect(() => {
    if (!outgoing) return;
    const t = setTimeout(() => {
      if (useCallStore.getState().outgoing?.callId === outgoing.callId &&
          !useCallStore.getState().active) {
        try { endCall(outgoing.callId); } catch { /* ignore */ }
        clearCall();
      }
    }, 30_000);
    return () => clearTimeout(t);
  }, [outgoing?.callId, clearCall]);

  const handleAccept = useCallback(async () => {
    if (!incoming) return;
    stopRing();
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
    stopRing();
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

  // P2-1: настоящая остановка камеры (LED гаснет), не просто track.enabled=false.
  // При повторном включении заново вызываем getUserMedia.
  const toggleCam = useCallback(async () => {
    const pc = pcRef.current;
    const local = localStreamRef.current;
    if (!pc || !local) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');

    if (!camOff) {
      // ВКЛ → ВЫКЛ: stop трека → replaceTrack(null) → камера-LED гаснет.
      const oldTrack = local.getVideoTracks()[0];
      if (oldTrack) {
        try { await sender?.replaceTrack(null); } catch { /* ignore */ }
        oldTrack.stop();
        local.removeTrack(oldTrack);
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = local;
      setCamOff(true);
    } else {
      // ВЫКЛ → ВКЛ: запрашиваем камеру заново.
      let newTrack: MediaStreamTrack | null = null;
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({ video: true });
        newTrack = fresh.getVideoTracks()[0] ?? null;
      } catch {
        toast.error('Не удалось включить камеру');
        return;
      }
      if (!newTrack) return;
      try { await sender?.replaceTrack(newTrack); } catch { /* ignore */ }
      local.addTrack(newTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = local;
      cameraTrackRef.current = newTrack;
      setCamOff(false);
    }
  }, [camOff]);

  // Восстановление камеры после остановки шеринга экрана.
  const restoreCameraTrack = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!sender) return;

    let cameraTrack = cameraTrackRef.current;
    // Если оригинальный трек был остановлен (например, при паузе), получаем новый.
    if (!cameraTrack || cameraTrack.readyState === 'ended') {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        cameraTrack = camStream.getVideoTracks()[0] ?? null;
      } catch {
        cameraTrack = null;
      }
    }

    if (cameraTrack) {
      await sender.replaceTrack(cameraTrack);
      // Обновляем локальный stream / превью.
      const local = localStreamRef.current;
      if (local) {
        local.getVideoTracks().forEach((t) => {
          if (t !== cameraTrack) local.removeTrack(t);
        });
        if (!local.getVideoTracks().includes(cameraTrack)) local.addTrack(cameraTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = local;
      }
      cameraTrack.enabled = !camOff;
      cameraTrackRef.current = cameraTrack;
    } else {
      // Камеры нет — отправляем «пустой» null-трек (некоторые браузеры допускают).
      try { await sender.replaceTrack(null); } catch { /* ignore */ }
    }
  }, [camOff]);

  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (sharingScreen) {
      // Останавливаем шеринг → возвращаем камеру.
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setSharingScreen(false);
      await restoreCameraTrack();
      return;
    }

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return; // Пользователь отменил выбор окна / экрана.
    }
    const displayTrack = displayStream.getVideoTracks()[0];
    if (!displayTrack) {
      displayStream.getTracks().forEach((t) => t.stop());
      return;
    }

    // Запоминаем текущий камера-трек, чтобы восстановить.
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!cameraTrackRef.current) {
      cameraTrackRef.current = sender?.track ?? null;
    }

    if (sender) {
      await sender.replaceTrack(displayTrack);
    } else {
      // На audio-звонке video-sender'а нет: добавляем трек.
      pc.addTrack(displayTrack, displayStream);
    }
    screenStreamRef.current = displayStream;
    setSharingScreen(true);

    // Локальное превью показывает то, чем мы делимся.
    if (localVideoRef.current) localVideoRef.current.srcObject = displayStream;

    // Автоматическая остановка по кнопке браузера «Stop sharing».
    displayTrack.onended = async () => {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setSharingScreen(false);
      await restoreCameraTrack();
    };
  }, [sharingScreen, restoreCameraTrack]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const isVideo = active?.callType === 'video' || incoming?.callType === 'video' || outgoing?.callType === 'video';

  return (
    <AnimatePresence>
      {(incoming || active || outgoing) && (
        <motion.div
          className={minimized
            ? 'fixed bottom-4 left-4 z-call pointer-events-none'
            : 'fixed inset-0 z-call flex items-center justify-center p-4'}
        >
          {/* Скрытый audio для аудиозвонков (video элемент обрабатывает видеозвонки) */}
          <audio ref={remoteAudioRef} autoPlay playsInline />

          {/* Подложка — отдельный слой с собственным fade, чтобы карточка «дышала» поверх */}
          <motion.div
            variants={backdrop} initial="hidden" animate="visible" exit="exit"
            className={`absolute inset-0 bg-black/80 backdrop-blur-md ${minimized ? 'hidden' : ''}`}
          />

          <motion.div
            variants={popIn} initial="hidden" animate="visible" exit="exit"
            onClick={minimized ? () => setMinimized(false) : undefined}
            className={`relative flex flex-col items-center rounded-3xl overflow-hidden shadow-e4 pointer-events-auto ${
              minimized
                ? `${isVideo && active ? 'w-56 h-72' : 'w-64'} bg-dark-card border border-dark-border cursor-pointer`
                : isVideo && active
                ? 'w-full h-full max-w-lg max-h-[90vh] bg-dark-bg'
                : 'w-full max-w-sm bg-dark-card border border-dark-border'
            }`}>

            {isVideo && active && (
              <>
                <video ref={remoteVideoRef} autoPlay playsInline
                  className="absolute inset-0 w-full h-full object-cover" />

                {/* Аватар собеседника когда у него камера выкл / ещё не подключилась.
                    На той же позиции что и видео — заменяет чёрный экран. */}
                <AnimatePresence>
                  {!remoteVideoActive && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-brand-radial bg-dark-bg z-[1]"
                    >
                      <div className="rounded-full shadow-glow-violet">
                        <Avatar src={peerAvatar} name={peerName} size="xl" />
                      </div>
                      <div className="text-center max-w-[260px] px-4">
                        <p className="text-lg font-semibold truncate">{peerName}</p>
                        <p className="text-[13px] text-white/55 mt-1">Камера выключена</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Локальный PiP. Если СВОЯ камера выключена — показываем мой аватар
                    в этом же окошке (а не прячем — иначе UX ломается). */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={SPRING.smooth}
                  className={`absolute top-4 right-4 w-20 h-28 sm:w-28 sm:h-40 rounded-2xl border border-white/15 z-[10] overflow-hidden bg-dark-card shadow-e3 ${minimized ? 'hidden' : ''}`}
                >
                  <video ref={localVideoRef} autoPlay playsInline muted
                    className={`w-full h-full object-cover ${camOff && !sharingScreen ? 'hidden' : ''} ${sharingScreen ? '' : '-scale-x-100'}`} />
                  {camOff && !sharingScreen && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-primary-700/30 to-dark-card">
                      <Avatar src={myAvatar} name={myName} size="md" />
                      <VideoOff size={14} className="text-white/60" />
                    </div>
                  )}
                </motion.div>

                <AnimatePresence>
                  {sharingScreen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      transition={SPRING.smooth}
                      className="absolute top-4 left-4 z-[20] flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-medium backdrop-blur-md shadow-e2"
                    >
                      <MonitorUp size={14} />
                      <span>Вы делитесь экраном</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}

            <div className={`relative z-10 flex flex-col items-center p-8 gap-4 ${minimized ? 'hidden' : ''} ${
              isVideo && active
                ? 'mt-auto w-full bg-gradient-to-t from-black/80 to-transparent pt-16 pb-8'
                : 'w-full'
            }`}>
              {!(isVideo && active) && (
                <>
                  <div className={`relative rounded-full ${incoming ? 'animate-pulse-glow' : 'shadow-glow-violet'}`}>
                    <Avatar src={peerAvatar} name={peerName} size="xl" />
                    {(outgoing || active) && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-dark-card animate-pulse" />
                    )}
                  </div>
                  <div className="text-center max-w-[260px]">
                    <p className="text-xl font-semibold truncate">{peerName}</p>
                    <p className="text-[13px] text-white/55 mt-1 tabular-nums">
                      {incoming && 'Входящий звонок…'}
                      {outgoing && 'Звоним…'}
                      {active && fmt(callTimer)}
                    </p>
                  </div>
                </>
              )}

              {isVideo && active && (
                <p className="text-[13px] text-white/75 self-center mb-2 tabular-nums">{fmt(callTimer)}</p>
              )}

              <div className="flex items-center justify-center gap-5 mt-2">
                {incoming && (
                  <>
                    <motion.button onClick={handleReject}
                      whileTap={tap} whileHover={{ scale: 1.05 }} transition={SPRING.snappy}
                      title="Отклонить" aria-label="Отклонить звонок"
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-e3 shadow-red-500/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60">
                      <PhoneOff size={24} className="text-white" />
                    </motion.button>
                    <motion.button onClick={handleAccept}
                      whileTap={tap} whileHover={{ scale: 1.05 }} transition={SPRING.snappy}
                      title="Принять" aria-label="Принять звонок"
                      className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-e3 shadow-green-500/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/60">
                      <Phone size={24} className="text-white" />
                    </motion.button>
                  </>
                )}
                {outgoing && (
                  <motion.button onClick={handleEnd}
                    whileTap={tap} whileHover={{ scale: 1.05 }} transition={SPRING.snappy}
                    title="Завершить" aria-label="Завершить звонок"
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-e3 shadow-red-500/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60">
                    <PhoneOff size={24} className="text-white" />
                  </motion.button>
                )}
                {active && (
                  <>
                    <motion.button onClick={toggleMute}
                      whileTap={tap} whileHover={{ scale: 1.06 }} transition={SPRING.snappy}
                      title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
                      aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                        muted ? 'bg-red-500/20 border border-red-500/50 text-red-400' : 'glass text-white/80 hover:text-white'
                      }`}>
                      {muted ? <MicOff size={20} /> : <Mic size={20} />}
                    </motion.button>
                    {isVideo && (
                      <motion.button onClick={toggleCam}
                        whileTap={tap} whileHover={{ scale: 1.06 }} transition={SPRING.snappy}
                        title={camOff ? 'Включить камеру' : 'Выключить камеру'}
                        aria-label={camOff ? 'Включить камеру' : 'Выключить камеру'}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                          camOff ? 'bg-red-500/20 border border-red-500/50 text-red-400' : 'glass text-white/80 hover:text-white'
                        }`}>
                        {camOff ? <VideoOff size={20} /> : <Video size={20} />}
                      </motion.button>
                    )}
                    {!isVideo && (
                      <button title="Динамик" aria-label="Динамик"
                        className="w-14 h-14 rounded-full glass flex items-center justify-center text-white/80">
                        <Volume2 size={20} />
                      </button>
                    )}
                    {isVideo && (
                      <motion.button onClick={toggleScreenShare}
                        whileTap={tap} whileHover={{ scale: 1.06 }} transition={SPRING.snappy}
                        title={sharingScreen ? 'Остановить показ экрана' : 'Поделиться экраном'}
                        aria-label={sharingScreen ? 'Остановить показ экрана' : 'Поделиться экраном'}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                          sharingScreen
                            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                            : 'glass text-white/80 hover:text-white'
                        }`}>
                        {sharingScreen ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
                      </motion.button>
                    )}
                    <motion.button onClick={() => setMinimized(true)}
                      whileTap={tap} whileHover={{ scale: 1.06 }} transition={SPRING.snappy}
                      title="Свернуть звонок" aria-label="Свернуть звонок"
                      className="w-14 h-14 rounded-full glass flex items-center justify-center text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
                      <Minimize2 size={20} />
                    </motion.button>
                    <motion.button onClick={handleEnd}
                      whileTap={tap} whileHover={{ scale: 1.05 }} transition={SPRING.snappy}
                      title="Завершить" aria-label="Завершить звонок"
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-e3 shadow-red-500/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60">
                      <PhoneOff size={22} className="text-white" />
                    </motion.button>
                  </>
                )}
              </div>
            </div>

            {/* ── Свёрнутая пилюля: компактный футер поверх (звонок продолжается) ── */}
            {minimized && (
              <div className={`z-20 flex items-center gap-2 p-3 ${
                isVideo && active
                  ? 'absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 to-transparent pt-8'
                  : 'w-full'
              }`}>
                {!(isVideo && active) && <Avatar src={peerAvatar} name={peerName} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate text-white">{peerName}</p>
                  <p className="text-[11px] text-white/65 tabular-nums">
                    {active ? fmt(callTimer) : outgoing ? 'Звоним…' : '…'}
                  </p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setMinimized(false); }}
                  title="Развернуть" aria-label="Развернуть звонок"
                  className="w-9 h-9 rounded-full glass flex items-center justify-center text-white/85 hover:text-white flex-shrink-0">
                  <Maximize2 size={16} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleEnd(); }}
                  title="Завершить" aria-label="Завершить звонок"
                  className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white flex-shrink-0">
                  <PhoneOff size={16} />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
