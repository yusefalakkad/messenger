import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion, AnimatePresence, useMotionValue, useSpring, useTransform,
  useScroll, useMotionTemplate,
} from 'framer-motion';
import DakkaIcon from '@/components/ui/DakkaIcon';
import {
  ShieldCheck, Phone, Mic, Video as VideoIcon, Smile, Lock, Globe,
  ArrowRight, Play, Apple, Smartphone, Sparkles, Heart, Check, ChevronDown,
} from 'lucide-react';

/**
 * Главная — редакторская типографика + ОБЪЁМНЫЙ 3D-телефон с живой перепиской,
 * влетающий брендовый луч со взрывом за телефоном, скролл-луч вдоль страницы,
 * курсор-glow и magnetic-карточки. Полностью тема-aware (text-content / dark-*).
 * Видна только неавторизованным; авторизованных роутер уводит в ChatPage.
 */
export default function LandingPage() {
  const navigate = useNavigate();

  // index.css держит `html, body, #root { overflow: hidden }` (чтобы чат не
  // оверскроллил). Лендинг длинный — включаем нативный скролл документа классом
  // `landing-scroll` (см. index.css): ОДИН скролл-контейнер (html), колёсико
  // работает, системный скроллбар скрыт (его роль играет луч слева).
  useEffect(() => {
    document.documentElement.classList.add('landing-scroll');
    return () => document.documentElement.classList.remove('landing-scroll');
  }, []);

  return (
    <div className="relative min-h-screen bg-dark-bg text-content overflow-x-hidden">
      <AmbientGlows />
      <CursorGlow />
      <ScrollBeam />

      <Header onSignIn={() => navigate('/auth')} />

      <Hero />

      <FeatureGrid />

      <PrivacySection />

      <DownloadSection onSignIn={() => navigate('/auth')} />

      <Footer />

      <ScrollDownButton />
    </div>
  );
}

// ─── Курсор-glow: брендовое пятно следует за мышью (десктоп) ──────────────────

function CursorGlow() {
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const sx = useSpring(x, { stiffness: 90, damping: 20 });
  const sy = useSpring(y, { stiffness: 90, damping: 20 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [x, y]);
  const bg = useMotionTemplate`radial-gradient(460px circle at ${sx}px ${sy}px, rgba(124,77,255,0.14), rgba(255,77,141,0.06) 40%, transparent 70%)`;
  return <motion.div aria-hidden className="fixed inset-0 z-0 pointer-events-none hidden md:block" style={{ background: bg }} />;
}

// ─── Скролл-луч: вьющаяся брендовая лента, прорисовывается по мере прокрутки ───
// Длинный извивающийся путь вдоль левого края — «луч путешествует» вниз по странице.

// Извивающийся путь в фикс-вьюпорте (viewBox 100×800 ≈ высота экрана, без растяжения).
const BEAM_PATH = 'M55 -10 C 96 90, 8 180, 52 280 C 96 380, 6 460, 50 560 C 94 650, 12 730, 56 810';

function ScrollBeam() {
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  const pathRef = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(900);
  useEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, []);
  // offset = len (скрыт) → 0 (полностью прорисован) по мере скролла
  const dashoffset = useTransform(smooth, [0, 1], [len, 0]);
  return (
    <svg
      aria-hidden
      className="fixed left-0 top-0 h-screen w-[100px] z-0 pointer-events-none hidden lg:block"
      viewBox="0 0 100 800" fill="none"
    >
      <defs>
        <linearGradient id="dakkaBeam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c4dff" />
          <stop offset="50%" stopColor="#ff4d8d" />
          <stop offset="100%" stopColor="#ff8a3d" />
        </linearGradient>
      </defs>
      {/* тусклый «рельс» */}
      <path d={BEAM_PATH} stroke="rgb(var(--content-rgb) / 0.07)" strokeWidth="2" />
      {/* светящийся луч — прорисовывается по мере прокрутки */}
      <motion.path
        ref={pathRef}
        d={BEAM_PATH}
        stroke="url(#dakkaBeam)" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={len}
        style={{ strokeDashoffset: dashoffset, filter: 'drop-shadow(0 0 5px rgba(255,77,141,0.5))' }}
      />
    </svg>
  );
}

// ─── Ambient floating gradient blurs (в светлой теме приглушены) ──────────────

function AmbientGlows() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, 20, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-accent-violet/15 dark:bg-accent-violet/30 blur-3xl"
      />
      <motion.div
        animate={{ x: [0, -25, 0], y: [0, -15, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-1/3 -right-40 w-[640px] h-[640px] rounded-full bg-accent-pink/12 dark:bg-accent-pink/25 blur-3xl"
      />
      <motion.div
        animate={{ x: [0, 18, 0], y: [0, -10, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-0 left-1/3 w-[440px] h-[440px] rounded-full bg-accent-orange/10 dark:bg-accent-orange/20 blur-3xl"
      />
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header className="relative z-20 px-6 lg:px-12 py-6 flex items-center justify-between max-w-[1480px] mx-auto">
      <div className="flex items-center gap-2.5">
        <DakkaIcon size={40} className="drop-shadow-[0_6px_18px_rgba(154,77,255,0.45)]" />
        <span className="text-xl font-semibold tracking-tight">Dakka</span>
      </div>

      <nav className="hidden md:flex items-center gap-9 text-sm text-content/60">
        <a href="#features" className="hover:text-content transition">Возможности</a>
        <a href="#privacy"  className="hover:text-content transition">Приватность</a>
        <a href="#download" className="hover:text-content transition">Загрузить</a>
      </nav>

      <div className="flex items-center gap-3">
        <button
          onClick={onSignIn}
          className="hidden sm:inline-flex text-sm text-content/70 hover:text-content px-3 py-2 rounded-lg transition"
        >
          Войти
        </button>
        <button
          onClick={onSignIn}
          className="text-sm text-content bg-content/[0.06] hover:bg-content/[0.10] border border-content/[0.10] px-4 py-2 rounded-xl transition"
        >
          Скачать
        </button>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto pt-6 lg:pt-10 pb-16 lg:pb-20">
      <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
        {/* ─── Left: typography hero ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
          className="space-y-8 text-center lg:text-left"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 text-xs text-content/65 bg-content/[0.05] border border-content/[0.09] rounded-full px-3 py-1.5"
          >
            <Sparkles size={12} className="text-accent-pink" />
            Приватность по умолчанию · бесплатно
          </motion.div>

          {/* HUGE typography — выровнено по базовой линии, читается в обеих темах */}
          <h1 className="font-extrabold leading-[0.9] tracking-[-0.04em] text-[15vw] sm:text-[12vw] lg:text-[7.4vw] xl:text-[112px]">
            <span className="block text-content">
              ПИШИ<span className="text-content/35">.</span>
            </span>
            <span
              className="block bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, #ff4d8d 0%, #ff8a3d 100%)' }}
            >
              ГОВОРИ<span className="text-accent-pink/80">.</span>
            </span>
            <span
              className="block bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, #7c4dff 0%, #34e0d0 100%)' }}
            >
              ЖИВИ<span className="text-accent-violet/80">.</span>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-content/60 text-lg max-w-md mx-auto lg:mx-0 leading-relaxed"
          >
            Мессенджер, в котором каждое сообщение дышит. Реакции, голос, видео —
            в одном живом холсте.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex justify-center lg:justify-start"
          >
            <button
              onClick={() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })}
              className="group inline-flex items-center justify-center gap-2 bg-brand-gradient hover:opacity-95 active:scale-[0.98] transition px-8 py-4 rounded-full text-base font-medium text-white shadow-glow-violet"
            >
              Скачать бесплатно
              <ArrowRight size={18} className="-ml-0.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </motion.div>

        {/* ─── Right: объёмный живой телефон + влетающий луч ─── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.85, ease: [0.32, 0.72, 0, 1] }}
          className="relative mx-auto"
          id="demo"
        >
          <LivePhone />
        </motion.div>
      </div>
    </section>
  );
}

// ─── Кнопка «вниз»: постоянная, по центру, ведёт к следующей секции ────────────
// Видна на всех секциях, прячется только у самого низа страницы.

function ScrollDownButton() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      // Прячем кнопку, когда СЛЕДУЮЩЕЙ секции уже нет (ты на последней) — тогда
      // стрелка вниз бесполезна. Пока страница ещё не скроллируема (landing-scroll
      // применяется отдельным эффектом) — НЕ прячем, иначе залипнет скрытой.
      const scrollable = document.documentElement.scrollHeight - window.innerHeight > 200;
      const hasNext = ['features', 'privacy', 'download']
        .map((id) => document.getElementById(id))
        .some((el) => el && el.getBoundingClientRect().top > 140);
      setHidden(scrollable && !hasNext);
    };
    onScroll();
    // повторный замер после раскладки/применения landing-scroll
    const raf = requestAnimationFrame(onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const goNext = () => {
    const next = ['features', 'privacy', 'download']
      .map((id) => document.getElementById(id))
      .find((el) => el && el.getBoundingClientRect().top > 120);
    if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  };

  // На последней секции кнопка не нужна — просто не рендерим (unmount = гарантированно
  // исчезает, без зависимости от opacity/framer). Хуки выше выполняются всегда.
  if (hidden) return null;

  return (
    <button
      onClick={goNext}
      className="hidden lg:flex fixed left-1/2 -translate-x-1/2 bottom-6 z-30 flex-col items-center gap-1.5 text-content/70 hover:text-content transition-colors"
      aria-label="Листать вниз"
    >
      <span className="text-[11px] tracking-wide uppercase">Листайте</span>
      <motion.span
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="w-11 h-11 rounded-full border border-content/25 bg-content/[0.08] backdrop-blur-md flex items-center justify-center shadow-e2"
      >
        <ChevronDown size={20} />
      </motion.span>
    </button>
  );
}

// ─── Влетающий луч + взрыв за телефоном (один раз на загрузке) ────────────────

function IntroBeam() {
  const [phase, setPhase] = useState<'fly' | 'burst' | 'done'>('fly');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('burst'), 1150);
    const t2 = setTimeout(() => setPhase('done'), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className="absolute inset-0 -z-10 pointer-events-none overflow-visible">
      {/* комета летит из верхнего-левого угла к центру телефона */}
      {phase === 'fly' && (
        <motion.div
          initial={{ left: '-60%', top: '-45%', opacity: 0, scale: 0.5 }}
          animate={{
            left:    ['-60%', '32%', '-6%', '50%'],
            top:     ['-45%', '6%', '44%', '50%'],
            opacity: [0, 1, 1, 1],
            scale:   [0.5, 1, 1, 1],
          }}
          transition={{ duration: 1.15, ease: 'easeInOut', times: [0, 0.4, 0.72, 1] }}
          className="absolute"
        >
          <div className="relative -translate-x-1/2 -translate-y-1/2">
            {/* хвост кометы */}
            <div className="absolute right-1/2 top-1/2 -translate-y-1/2 w-40 h-1.5 origin-right rotate-[28deg] rounded-full bg-gradient-to-l from-accent-pink/90 to-transparent blur-[2px]" />
            {/* ядро */}
            <div className="w-10 h-10 rounded-full bg-brand-gradient blur-md opacity-95" />
            <div className="absolute inset-0 w-10 h-10 rounded-full bg-white/80 blur-[6px] scale-50" />
          </div>
        </motion.div>
      )}

      {/* взрыв в центре (за телефоном — свет выбивается по краям силуэта) */}
      {phase === 'burst' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            initial={{ scale: 0, opacity: 0.85 }}
            animate={{ scale: 7, opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="w-28 h-28 rounded-full bg-brand-gradient blur-2xl"
          />
          <motion.div
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.75, ease: 'easeOut' }}
            className="absolute inset-0 w-28 h-28 rounded-full border-2 border-accent-pink/70"
          />
          {/* искры */}
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const dist = 150 + (i % 3) * 30;
            return (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-accent-pink shadow-[0_0_8px_rgba(255,77,141,0.8)]"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Объёмный живой телефон: переписка по кругу + 3D-наклон + блик ────────────

type ScriptMsg =
  | { id: number; kind: 'in' | 'out'; text: string }
  | { id: number; kind: 'voice' };

const SCRIPT: ScriptMsg[] = [
  { id: 0, kind: 'in',  text: 'Видел новый Dakka? Интерфейс просто 🔥' },
  { id: 1, kind: 'out', text: 'Да! Живые реакции и стекло — топ' },
  { id: 2, kind: 'voice' },
  { id: 3, kind: 'in',  text: 'созвон вечером? 🎧' },
];

const TIMELINE: Array<{ at: number; type: 'typing' | 'msg' | 'react' | 'reset'; i?: number }> = [
  { at: 500,  type: 'typing' },
  { at: 1500, type: 'msg',   i: 0 },
  { at: 2600, type: 'msg',   i: 1 },
  { at: 3500, type: 'react', i: 0 },
  { at: 4300, type: 'typing' },
  { at: 5300, type: 'msg',   i: 2 },
  { at: 6500, type: 'msg',   i: 3 },
  // переписка проигрывается ОДИН раз и остаётся на экране (без зацикливания).
];

function LivePhone() {
  const [shown,   setShown]   = useState<number[]>([]);
  const [typing,  setTyping]  = useState(false);
  const [reacted, setReacted] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setShown([]); setTyping(false); setReacted(false);
      for (const ev of TIMELINE) {
        timers.push(setTimeout(() => {
          if (ev.type === 'typing') setTyping(true);
          else if (ev.type === 'msg') { setTyping(false); setShown((s) => [...s, ev.i!]); }
          else if (ev.type === 'react') setReacted(true);
          else if (ev.type === 'reset') run();
        }, ev.at));
      }
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative w-[290px] sm:w-[330px] mx-auto" style={{ perspective: 1100 }}>
      {/* свечение под телефоном */}
      <div className="absolute inset-0 -inset-x-12 bg-accent-pink/20 blur-3xl rounded-full" />
      <IntroBeam />

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-[46px] p-[3px] bg-gradient-to-br from-white/20 via-white/5 to-transparent shadow-[0_40px_90px_-20px_rgba(0,0,0,0.75)]"
      >
        {/* боковые кнопки iPhone — mute + громкость слева, питание справа */}
        <span aria-hidden className="absolute -left-[2px] top-[17%] w-[3px] h-6 rounded-l bg-black/55" />
        <span aria-hidden className="absolute -left-[2px] top-[26%] w-[3px] h-9 rounded-l bg-black/50" />
        <span aria-hidden className="absolute -left-[2px] top-[37%] w-[3px] h-9 rounded-l bg-black/50" />
        <span aria-hidden className="absolute -right-[2px] top-[24%] w-[3px] h-16 rounded-r bg-black/50" />

        {/* корпус */}
        <div className="relative rounded-[44px] bg-[#0a0814] border border-white/[0.06] overflow-hidden">
          <div className="aspect-[0.49] flex flex-col">
            {/* Dynamic Island — строго по центру, плоский (без перекоса) */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-7 bg-black rounded-full z-30" />

            {/* status bar */}
            <div className="absolute top-0 left-0 right-0 px-6 pt-4 flex justify-between items-center text-[11px] text-white/85 z-20">
              <span className="font-medium">9:41</span>
              <span className="w-3 h-2 rounded-sm border border-white/60" />
            </div>

            {/* peer header */}
            <div className="flex items-center gap-3 px-4 pt-14 pb-3 border-b border-white/[0.06]">
              <button className="text-white/50 text-lg leading-none">‹</button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-pink to-accent-orange flex items-center justify-center text-xs font-semibold text-white">
                МК
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">Майя</div>
                <div className="text-[10px] text-accent-pink/85">{typing ? 'печатает…' : 'в сети'}</div>
              </div>
              <VideoIcon size={16} className="text-white/55" />
            </div>

            {/* messages */}
            <div className="flex-1 flex flex-col justify-end gap-2 px-4 py-3 overflow-hidden">
              <AnimatePresence>
                {shown.map((i) => {
                  const m = SCRIPT[i];
                  if (m.kind === 'voice') {
                    return (
                      <motion.div
                        key={m.id}
                        layout
                        initial={{ opacity: 0, y: 14, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                        className="self-start flex items-center gap-2 bg-white/[0.06] border border-white/[0.06] rounded-2xl rounded-bl-md px-3 py-2 max-w-[72%]"
                      >
                        <span className="w-6 h-6 rounded-full bg-brand-gradient flex items-center justify-center flex-shrink-0">
                          <Play size={11} fill="white" className="text-white" />
                        </span>
                        <LiveWaveform />
                        <span className="text-[10px] text-white/70 tabular-nums">0:12</span>
                      </motion.div>
                    );
                  }
                  return (
                    <motion.div
                      key={m.id}
                      layout
                      initial={{ opacity: 0, y: 14, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      className={
                        m.kind === 'out'
                          ? 'relative self-end bg-brand-gradient text-white rounded-2xl rounded-br-md px-3 py-2 text-[12px] max-w-[74%] shadow-glow-pink'
                          : 'relative self-start bg-white/[0.06] text-white/95 rounded-2xl rounded-bl-md px-3 py-2 text-[12px] max-w-[74%] border border-white/[0.05]'
                      }
                    >
                      {m.text}
                      {m.id === 0 && (
                        <AnimatePresence>
                          {reacted && (
                            <motion.span
                              initial={{ scale: 0, y: 4 }}
                              animate={{ scale: 1, y: 0 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 16 }}
                              className="absolute -bottom-2.5 -right-1 flex items-center gap-0.5 bg-[#1a1726] border border-white/10 rounded-full pl-1 pr-1.5 py-0.5 shadow-lg"
                            >
                              <Heart size={9} fill="#ff4d8d" className="text-accent-pink" />
                              <span className="text-[9px] text-white/80">1</span>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      )}
                    </motion.div>
                  );
                })}

                {typing && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className="self-start flex items-center gap-1 bg-white/[0.06] border border-white/[0.05] rounded-2xl rounded-bl-md px-3 py-2.5"
                  >
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                        transition={{ duration: 1, repeat: Infinity, delay: d * 0.18 }}
                        className="w-1.5 h-1.5 rounded-full bg-white/70"
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* composer */}
            <div className="px-4 pb-5 pt-1 flex items-center gap-2">
              <button className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/55 flex-shrink-0">+</button>
              <div className="flex-1 h-9 rounded-full bg-white/[0.04] border border-white/[0.06] px-4 flex items-center text-[12px] text-white/35">
                Сообщение
              </div>
              <button className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-pink to-accent-orange flex items-center justify-center flex-shrink-0">
                <Mic size={14} fill="white" className="text-white" />
              </button>
            </div>
          </div>

          {/* статичный стеклянный блик — без перерисовки на каждый кадр, не лагает */}
          <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[44px] bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}

// Анимированная волна голосового — бегущие столбики
function LiveWaveform() {
  const bars = [3, 8, 5, 11, 7, 13, 6, 10, 4, 9, 6, 11];
  return (
    <div className="flex items-center gap-[2px] flex-1">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          animate={{ scaleY: [1, 0.45, 1] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
          className="w-[2px] bg-white/85 rounded-full origin-center"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

// ─── Feature grid (magnetic-наклон карточек к курсору) ────────────────────────

function FeatureGrid() {
  const items = [
    { icon: Lock,      title: 'Защита данных',       desc: 'TLS-шифрование трафика, приватные медиа и 2FA. Доступ к чату — только у участников.' },
    { icon: Mic,       title: 'Голосовые сообщения', desc: 'Жмёшь и говоришь — мгновенно, с волной и автостопом.' },
    { icon: VideoIcon, title: 'Звонки и видео',      desc: 'Один-на-один + групповые до 8. Без задержек, через свой TURN/SFU.' },
    { icon: Smile,     title: 'Живые реакции',       desc: 'Эмодзи, ответы, цитаты, пересылка — всё под пальцем.' },
    { icon: Phone,     title: 'По номеру',           desc: 'Вход одним кодом через Telegram. Никаких паролей.' },
    { icon: Globe,     title: 'Web, iOS, Android',   desc: 'Один аккаунт, бесшовная синхронизация между устройствами.' },
  ];
  return (
    <section id="features" className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto py-16 lg:py-20 lg:min-h-screen lg:flex lg:flex-col lg:justify-center">
      <SectionHeader
        chip="Возможности"
        title="Всё для живого общения"
        sub="Стандарт большой тройки — без рекламы, без слежки, без компромиссов в дизайне."
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
        {items.map((it, i) => (
          <TiltCard key={it.title} index={i}>
            <div className="w-11 h-11 rounded-xl bg-brand-gradient-soft border border-content/[0.08] flex items-center justify-center mb-4 transition group-hover:scale-110">
              <it.icon size={18} className="text-accent-pink" />
            </div>
            <div className="text-base font-medium mb-1.5">{it.title}</div>
            <div className="text-sm text-content/55 leading-relaxed">{it.desc}</div>
          </TiltCard>
        ))}
      </div>
    </section>
  );
}

// Карточка с magnetic-наклоном к курсору (интерактив этого «уровня»)
function TiltCard({ children, index }: { children: React.ReactNode; index: number }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]),  { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]),  { stiffness: 200, damping: 20 });
  const onMove = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  return (
    <motion.div
      onMouseMove={onMove}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, delay: index * 0.05, ease: [0.32, 0.72, 0, 1] }}
      style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d', perspective: 700 }}
      className="group p-6 rounded-2xl bg-content/[0.025] border border-content/[0.07] hover:bg-content/[0.045] hover:border-content/[0.12] transition-colors"
    >
      {children}
    </motion.div>
  );
}

// ─── Privacy section ──────────────────────────────────────────────────────────

function PrivacySection() {
  return (
    <section id="privacy" className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto py-16 lg:py-20 lg:min-h-screen lg:flex lg:flex-col lg:justify-center">
      <div className="grid lg:grid-cols-2 gap-14 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 text-xs text-accent-violet bg-accent-violet/[0.12] border border-accent-violet/[0.22] rounded-full px-3 py-1.5 mb-6">
            <ShieldCheck size={12} /> Приватность
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] mb-6">
            Ваши слова —<br />
            только <span className="bg-clip-text text-transparent bg-brand-gradient">ваши</span>.
          </h2>
          <p className="text-content/60 text-lg leading-relaxed max-w-md">
            Соединение защищено TLS, медиафайлы приватны и доступны только участникам чата.
            Пароли хранятся как Argon2-хеши, вход — по одноразовому коду, плюс 2FA.
          </p>

          <div className="mt-8 space-y-3 text-sm text-content/70">
            {[
              'TLS 1.2/1.3, HSTS и строгие security-заголовки',
              'TURN с эфемерными HMAC-credentials, TTL 10 минут',
              'Приватное хранилище медиа: доступ только участникам чата',
              'Двухфакторная защита через TOTP (Google Authenticator)',
            ].map((line) => (
              <div key={line} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-accent-pink/15 flex items-center justify-center flex-shrink-0">
                  <Check size={11} className="text-accent-pink" />
                </span>
                {line}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="relative"
        >
          <div className="relative p-8 rounded-3xl bg-content/[0.03] border border-content/[0.08] overflow-hidden">
            <div className="absolute -inset-1 bg-brand-gradient-soft blur-2xl pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-glow-violet">
                <Lock size={28} className="text-white" />
              </div>
              <div>
                <div className="text-2xl font-semibold">Защищённое соединение</div>
                <div className="text-sm text-content/55">TLS · приватные медиа · 2FA</div>
              </div>
            </div>

            <div className="relative mt-7 p-4 rounded-xl bg-black/40 border border-white/[0.06] font-mono text-[11px] text-white/70 leading-relaxed">
              <span className="text-accent-pink">{'> '}</span>tls: <span className="text-accent-orange">'1.3'</span><br/>
              <span className="text-accent-pink">{'> '}</span>hsts: <span className="text-accent-orange">enabled</span><br/>
              <span className="text-accent-pink">{'> '}</span>media: <span className="text-white/40">private</span><br/>
              <span className="text-accent-pink">{'> '}</span>2fa: <span className="text-white/40">'TOTP'</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Download section ─────────────────────────────────────────────────────────

function DownloadSection({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section id="download" className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto py-16 lg:py-20 lg:min-h-screen lg:flex lg:flex-col lg:justify-center">
      <SectionHeader
        chip="Загрузить"
        title="Везде, где вы есть"
        sub="Установите Dakka на любое устройство — все ваши чаты автоматически появятся."
      />

      <div className="grid sm:grid-cols-3 gap-4 mt-12">
        <DownloadCard icon={Apple}      title="iPhone & iPad" sub="iOS 16.4+"           onClick={onSignIn} />
        <DownloadCard icon={Smartphone} title="Android"       sub="Android 8+"          onClick={onSignIn} />
        <DownloadCard icon={Globe}      title="Web"           sub="Браузер — прямо здесь" onClick={onSignIn} highlight />
      </div>
    </section>
  );
}

function DownloadCard({
  icon: Icon, title, sub, onClick, highlight,
}: {
  icon: typeof Apple; title: string; sub: string; onClick: () => void; highlight?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`group relative text-left p-6 rounded-2xl border transition-colors overflow-hidden
        ${highlight
          ? 'bg-brand-gradient-soft border-content/[0.14] hover:border-content/[0.22]'
          : 'bg-content/[0.025] border-content/[0.07] hover:bg-content/[0.045] hover:border-content/[0.12]'
        }`}
    >
      <Icon size={32} className="mb-4 text-content/85 group-hover:scale-110 transition" />
      <div className="text-base font-medium mb-1">{title}</div>
      <div className="text-sm text-content/55">{sub}</div>
      <div className="flex items-center gap-1 mt-3 text-xs text-accent-pink opacity-0 group-hover:opacity-100 transition">
        Открыть <ArrowRight size={12} />
      </div>
    </motion.button>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto pt-12 pb-16 border-t border-content/[0.07] space-y-8">
      {/* Юридический дисклеймер — снимаем ответственность с сервиса/разработчиков. */}
      <div className="text-[12px] leading-relaxed text-content/40 space-y-3 max-w-3xl">
        <p>
          Dakka предоставляется на условиях «как есть» (as is) и «как доступно» (as available),
          без каких-либо гарантий, явных или подразумеваемых, включая, помимо прочего, гарантии
          пригодности для определённой цели, бесперебойной и безошибочной работы, сохранности данных
          и безопасности.
        </p>
        <p>
          Используя сервис, вы соглашаетесь, что делаете это на свой страх и риск. Администрация и
          разработчики в максимально допустимой законом степени не несут ответственности за любой
          прямой, косвенный, случайный или последующий ущерб, утрату данных, сообщений, медиафайлов
          либо упущенную выгоду, возникшие в результате использования или невозможности использования
          сервиса.
        </p>
        <p>
          Сервис не предназначен для экстренной связи. Пользователи несут полную ответственность за
          размещаемый ими контент и обязуются соблюдать применимое законодательство. Продолжая
          использование, вы принимаете{' '}
          <a href="#" className="text-content/60 underline hover:text-content/90">Пользовательское соглашение</a> и{' '}
          <a href="#" className="text-content/60 underline hover:text-content/90">Политику конфиденциальности</a>.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-content/45 pt-6 border-t border-content/[0.05]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-brand-gradient flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
              <path d="M4 8C4 6.9 4.9 6 6 6h20c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H18l-4 4-2-4H6c-1.1 0-2-.9-2-2V8z" fill="white"/>
            </svg>
          </div>
          <span className="text-content/70 font-medium">Dakka</span>
          <span>© 2026 · Все права защищены</span>
        </div>
        <div className="flex items-center gap-5 flex-wrap justify-center">
          <a href="#" className="hover:text-content/80 transition">Соглашение</a>
          <a href="#" className="hover:text-content/80 transition">Конфиденциальность</a>
          <a href="#" className="hover:text-content/80 transition">Оферта</a>
          <a href="mailto:hello@akkdmsg.online" className="hover:text-content/80 transition">Связаться</a>
        </div>
      </div>
    </footer>
  );
}

// ─── Reusable section header ──────────────────────────────────────────────────

function SectionHeader({ chip, title, sub }: { chip: string; title: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="text-center max-w-2xl mx-auto"
    >
      <div className="inline-flex items-center gap-2 text-xs text-content/60 bg-content/[0.05] border border-content/[0.09] rounded-full px-3 py-1.5 mb-5">
        {chip}
      </div>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] mb-5">
        {title}
      </h2>
      <p className="text-content/60 text-lg leading-relaxed">{sub}</p>
    </motion.div>
  );
}
