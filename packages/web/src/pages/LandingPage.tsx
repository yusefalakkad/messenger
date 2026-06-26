import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import {
  Download, Sun, Moon, Lock, Video, Mic, Waves, Users, Shield,
  Phone, MoreHorizontal, Settings, Plus, Play, MessageCircle, ArrowRight,
} from 'lucide-react';
import OceanLogo from '@/components/ui/OceanLogo';
import { desktopDownload } from '@/lib/desktopDownload';
import { getStoredMode, setMode as applyThemeMode } from '@/lib/theme';

/**
 * Лендинг ocean — точное воссоздание дизайн-хендоффа (landing-ocean.jsx +
 * land-mock.jsx): nav · hero «Сообщения, что текут плавно» + кластер устройств ·
 * статистика · фичи «Всё под одной волной» · showcase · CTA «Нырните в ocean» ·
 * футер. Цвета — через CSS-переменные темы (живо реагируют на смену темы),
 * бренд — океанский градиент. Кнопки завязаны на реальные действия (вход/скачать).
 */

const GRAD = 'linear-gradient(135deg, #42E6CE 0%, #16B6E0 40%, #2D6BF0 74%, #1E40C8 100%)';

// Токены темы как ссылки на CSS-переменные → меняются вместе с data-theme без re-render.
const C = {
  bg:          'rgb(var(--bg-rgb))',
  panel:       'rgb(var(--surface-rgb))',
  card:        'rgb(var(--card-rgb))',
  rail:        'rgb(var(--rail-rgb))',
  ink:         'rgb(var(--content-rgb))',
  ink2:        'rgb(var(--content-rgb) / 0.6)',
  ink3:        'rgb(var(--content-rgb) / 0.4)',
  hair:        'rgb(var(--border-rgb) / 0.7)',
  rim:         'rgb(var(--border-rgb))',
  raise:       'rgb(var(--content-rgb) / 0.05)',
  raiseHi:     'rgb(var(--content-rgb) / 0.09)',
  online:      'var(--online)',
  mesh:        'var(--app-bg-image)',
  shadow:      'var(--shadow-window)',
  shadowSm:    'var(--shadow-card)',
  inBub:       'var(--bubble-in)',
  inBubBorder: 'rgb(var(--border-rgb) / 0.5)',
};

const gradText: CSSProperties = {
  background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
};

// ── Анимированный океанский фон с параллаксом при скролле ─────────────────────
// Несколько мягких океанских «орбов» дрейфуют (CSS) и параллаксят по скроллу
// (разная скорость на слой), плюс плавные волны снизу. Лежит fixed за контентом.
function OceanBackdrop() {
  const raw = useMotionValue(0);
  const sy = useSpring(raw, { stiffness: 60, damping: 22, mass: 0.6 });

  useEffect(() => {
    const onScroll = () => raw.set(document.documentElement.scrollTop || window.scrollY || 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll);
    };
  }, [raw]);

  const y1 = useTransform(sy, (v) => v * 0.18);
  const y2 = useTransform(sy, (v) => -v * 0.12);
  const y3 = useTransform(sy, (v) => v * 0.10);
  const y4 = useTransform(sy, (v) => -v * 0.06);
  const waveY = useTransform(sy, (v) => v * 0.04);

  // Параллакс — на внешнем motion.div (y), дрейф — на внутреннем (CSS), чтобы
  // два transform не конфликтовали.
  const Orb = ({ y, drift, color, size, pos }: {
    y: MotionValue<number>; drift: string; color: string; size: number; pos: CSSProperties;
  }) => (
    <motion.div style={{ position: 'absolute', y, ...pos }}>
      <div className={drift} style={{ width: size, height: size, borderRadius: '50%', filter: 'blur(70px)', background: `radial-gradient(circle, ${color}, transparent 70%)` }} />
    </motion.div>
  );

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }} aria-hidden>
      <Orb y={y1} drift="animate-drift-a" color="rgba(66,230,206,0.30)" size={540} pos={{ top: -140, left: -100 }} />
      <Orb y={y2} drift="animate-drift-b" color="rgba(22,182,224,0.26)" size={620} pos={{ top: 20, right: -160 }} />
      <Orb y={y3} drift="animate-drift-c" color="rgba(45,107,240,0.24)" size={700} pos={{ top: '44%', left: '6%' }} />
      <Orb y={y4} drift="animate-drift-a" color="rgba(122,69,230,0.18)" size={480} pos={{ bottom: '6%', right: '4%' }} />
      {/* плавные волны снизу */}
      <motion.svg viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ position: 'absolute', bottom: -20, left: '-10%', width: '120%', height: 280, opacity: 0.5, y: waveY }}>
        <path className="animate-wave-slow" fill="rgba(45,107,240,0.12)" d="M0,160 C240,220 480,90 720,140 C960,190 1200,110 1440,160 L1440,320 L0,320 Z" />
        <path className="animate-wave-fast" fill="rgba(52,220,200,0.10)" d="M0,200 C240,150 480,250 720,200 C960,150 1200,240 1440,190 L1440,320 L0,320 Z" />
      </motion.svg>
    </div>
  );
}

// ── Появление секции при вскролле ────────────────────────────────────────────
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ── Бренд-глифы Apple / Windows (точные path из дизайн-системы) ───────────────
function AppleGlyph({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 13.5c0 3 2 4 2 4s-1.4 3-3.2 3c-1 0-1.6-.6-2.8-.6s-1.9.6-2.8.6C7 21 5 17.5 5 14c0-3.4 2.2-5 4-5 1.1 0 2 .7 2.8.7S13.4 9 14.6 9c1.6 0 2.6 1 3.1 1.8-1.5.8-1.7 2.4-1.7 2.7zM13 6.5c.7-.9 1-2 .9-2.5-1 .1-1.8.6-2.3 1.2-.5.6-.9 1.5-.8 2.4 1 .1 1.6-.4 2.2-1.1z" fill={color} />
    </svg>
  );
}
function WindowsGlyph({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5l8-1v7H3zM13 3.7L21 3v9h-8zM3 12h8v7l-8-1zM13 12h8v9l-8-1z" fill={color} />
    </svg>
  );
}

// ── Кнопка ───────────────────────────────────────────────────────────────────
function Btn({ children, primary, large, icon, onClick }: {
  children: ReactNode; primary?: boolean; large?: boolean; icon?: ReactNode; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="active:scale-[0.98]"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer',
        padding: large ? '15px 28px' : '11px 20px', borderRadius: 30,
        fontWeight: 700, fontSize: large ? 16 : 14.5, transition: 'transform .15s, filter .15s',
        background: primary ? GRAD : C.panel, color: primary ? '#fff' : C.ink,
        border: primary ? 'none' : `1px solid ${C.rim}`,
        boxShadow: primary ? '0 12px 30px -8px rgba(45,107,240,0.55)' : C.shadowSm,
      }}
    >
      {icon}{children}
    </button>
  );
}

// ── Мини-аватар для моков ───────────────────────────────────────────────────
const ACCENTS: Record<string, [string, string, string]> = {
  aqua:   ['#5DEBD6', '#13B6BE', '#34DCC8'],
  cyan:   ['#5BD2FF', '#1689E0', '#3BB4F0'],
  ocean:  ['#6AA2FF', '#2D5BF0', '#5B82FF'],
  amber:  ['#FFD58A', '#FF9A3D', '#FFB257'],
  violet: ['#C79CFF', '#7A45E6', '#A878F0'],
};
function MiniAvatar({ accent = 'cyan', initials = 'A', size = 40, ring = false }: {
  accent?: string; initials?: string; size?: number; ring?: boolean;
}) {
  const [from, to, glow] = ACCENTS[accent] || ACCENTS.cyan;
  const r = size / 2;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {ring && (
        <div style={{
          position: 'absolute', inset: -4, borderRadius: r + 4,
          boxShadow: `0 0 0 2px ${glow}`, animation: 'presencePulse 2.4s ease-in-out infinite',
        }} />
      )}
      <div style={{
        width: size, height: size, borderRadius: r,
        background: `linear-gradient(150deg, ${from}, ${to})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -8px 16px rgba(0,0,0,0.16)',
        color: '#fff', fontWeight: 600, fontSize: size * 0.4, letterSpacing: '-0.02em',
        textShadow: '0 1px 2px rgba(0,0,0,0.18)',
      }}>{initials}</div>
    </div>
  );
}

// ── Мини-вейвформа ───────────────────────────────────────────────────────────
function MiniWave({ count = 16, progress = 0.5, height = 18 }: { count?: number; progress?: number; height?: number }) {
  const bars = Array.from({ length: count }, (_, i) => {
    const env = 0.45 + 0.55 * Math.abs(Math.sin((i / count) * Math.PI * 3.2 + 5));
    return Math.max(0.25, env);
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 2, height: Math.round(h * height), borderRadius: 2, flexShrink: 0,
          background: (i / count) < progress ? '#3BB4F0' : 'rgba(59,180,240,0.3)',
        }} />
      ))}
    </div>
  );
}

// ── Десктоп-мок окна ────────────────────────────────────────────────────────
function WindowMock() {
  const rows = [
    { initials: 'МК', accent: 'cyan',   name: 'Майя Кравцова', msg: 'печатает…',          time: '12:48', unread: 3, active: false, online: true },
    { initials: 'ДР', accent: 'aqua',   name: 'Денис Рощин',   msg: 'Скинул макет, глянь', time: '11:50', active: true, online: true },
    { initials: 'СВ', accent: 'amber',  name: 'Соня Власова',  msg: '📷 Фотография',       time: '10:12', unread: 1 },
    { initials: 'АП', accent: 'violet', name: 'Артём',         msg: 'Ха, ну ты даёшь 😄',  time: 'Вчера' },
  ];
  const railIcons = [<MessageCircle key="c" size={19} />, <Phone key="p" size={19} />, <Users key="u" size={19} />, <Settings key="g" size={19} />];
  const headIcons = [<Phone key="p" size={18} />, <Video key="v" size={18} />, <MoreHorizontal key="m" size={18} />];
  return (
    <div style={{ width: 880, height: 540, borderRadius: 18, overflow: 'hidden', background: C.bg, border: `1px solid ${C.rim}`, boxShadow: C.shadow, display: 'flex' }}>
      {/* рельс */}
      <div style={{ width: 60, background: C.rail, borderRight: `1px solid ${C.hair}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16, gap: 14 }}>
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start', marginLeft: 14, marginBottom: 6 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 9, height: 9, borderRadius: 5, background: c }} />)}
        </div>
        <OceanLogo size={36} />
        {railIcons.map((ic, i) => (
          <div key={i} style={{ width: 38, height: 38, borderRadius: 12, background: i === 0 ? C.raiseHi : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: i === 0 ? C.ink : C.ink3 }}>{ic}</div>
        ))}
      </div>
      {/* список */}
      <div style={{ width: 270, background: C.panel, borderRight: `1px solid ${C.hair}`, padding: '16px 12px' }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', margin: '4px 6px 12px' }}>Чаты</div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 13, background: r.active ? C.raiseHi : 'transparent', marginBottom: 2 }}>
            <MiniAvatar accent={r.accent} initials={r.initials} size={40} ring={!!r.online} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: r.unread ? 700 : 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              <div style={{ fontSize: 12, color: r.msg === 'печатает…' ? '#3BB4F0' : C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.msg}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              <span style={{ fontSize: 10.5, color: r.unread ? '#3BB4F0' : C.ink3 }}>{r.time}</span>
              {r.unread
                ? <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: GRAD, color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.unread}</span>
                : <div style={{ height: 18 }} />}
            </div>
          </div>
        ))}
      </div>
      {/* переписка */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: C.bg }}>
        <div style={{ position: 'absolute', inset: 0, background: C.mesh, pointerEvents: 'none' }} />
        <div style={{ height: 58, borderBottom: `1px solid ${C.hair}`, display: 'flex', alignItems: 'center', gap: 11, padding: '0 18px', position: 'relative', background: C.panel }}>
          <MiniAvatar accent="aqua" initials="ДР" size={36} ring />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>Денис Рощин</div>
            <div style={{ fontSize: 11.5, color: C.online, fontWeight: 600 }}>в сети</div>
          </div>
          {headIcons.map((ic, i) => <span key={i} style={{ margin: '0 5px', color: C.ink2, display: 'flex' }}>{ic}</span>)}
        </div>
        <div style={{ flex: 1, padding: '18px 22px', position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ alignSelf: 'flex-start', maxWidth: 280, background: C.inBub, border: `1px solid ${C.inBubBorder}`, color: C.ink, fontSize: 13.5, padding: '8px 13px', borderRadius: 16, borderBottomLeftRadius: 6 }}>Сделал в океанской палитре 🌊</div>
          <div style={{ alignSelf: 'flex-end', maxWidth: 280, background: GRAD, color: '#fff', fontSize: 13.5, padding: '8px 13px', borderRadius: 16, borderBottomRightRadius: 6, boxShadow: '0 8px 18px -8px rgba(45,107,240,0.6)' }}>Огонь 🔥 Очень плавно ложится</div>
          <div style={{ alignSelf: 'flex-end', maxWidth: 280, background: GRAD, color: '#fff', fontSize: 13.5, padding: '8px 13px', borderRadius: 16, borderTopRightRadius: 6, boxShadow: '0 8px 18px -8px rgba(45,107,240,0.6)' }}>Светлая тоже шикарная вышла</div>
        </div>
        <div style={{ padding: '12px 18px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.panel, border: `1px solid ${C.rim}`, borderRadius: 22, padding: '7px 8px 7px 14px' }}>
            <span style={{ color: C.ink2, display: 'flex' }}><Plus size={19} /></span>
            <span style={{ flex: 1, fontSize: 13, color: C.ink3 }}>Напишите сообщение…</span>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mic size={17} color="#fff" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Мок телефона ─────────────────────────────────────────────────────────────
function PhoneMock({ isLight }: { isLight: boolean }) {
  const frame = isLight ? '#0B2138' : '#000';
  return (
    <div style={{ width: 248, height: 510, borderRadius: 44, padding: 10, background: frame, boxShadow: C.shadow, border: `1px solid ${C.rim}` }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden', background: C.bg, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', inset: 0, background: C.mesh, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: 96, height: 26, borderRadius: 13, background: frame, zIndex: 5 }} />
        <div style={{ height: 92, position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 10, padding: '0 16px 12px' }}>
          <MiniAvatar accent="cyan" initials="МК" size={40} ring />
          <div><div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>Майя</div><div style={{ fontSize: 11.5, color: C.online, fontWeight: 600 }}>в сети</div></div>
        </div>
        <div style={{ flex: 1, padding: '6px 16px', position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ alignSelf: 'flex-start', maxWidth: 180, background: C.inBub, border: `1px solid ${C.inBubBorder}`, color: C.ink, fontSize: 13, padding: '8px 12px', borderRadius: 16, borderBottomLeftRadius: 5 }}>Уже в пути! 🌊</div>
          <div style={{ alignSelf: 'flex-end', maxWidth: 180, background: GRAD, color: '#fff', fontSize: 13, padding: '8px 12px', borderRadius: 16, borderBottomRightRadius: 5 }}>Жду у причала ⚓️</div>
          <div style={{ alignSelf: 'flex-start', width: 150, background: C.inBub, border: `1px solid ${C.inBubBorder}`, padding: '8px 12px', borderRadius: 16, borderBottomLeftRadius: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(59,180,240,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={13} color="#3BB4F0" /></div>
            <MiniWave count={16} progress={0.5} height={18} />
          </div>
        </div>
        <div style={{ padding: '8px 14px 16px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.panel, border: `1px solid ${C.rim}`, borderRadius: 20, padding: '6px 6px 6px 14px' }}>
            <span style={{ flex: 1, fontSize: 12.5, color: C.ink3 }}>Сообщение</span>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mic size={15} color="#fff" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Карточка фичи ────────────────────────────────────────────────────────────
function FeatureCard({ icon, accent, title, body, wide }: {
  icon: ReactNode; accent: string; title: string; body: string; wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''} style={{ background: C.panel, border: `1px solid ${C.hair}`, borderRadius: 22, padding: 28, boxShadow: C.shadowSm, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -30, right: -20, width: 160, height: 110, background: `radial-gradient(circle, ${accent}28, transparent 70%)` }} />
      <div style={{ width: 50, height: 50, borderRadius: 15, background: `linear-gradient(140deg, ${accent}, ${accent}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, boxShadow: `0 10px 24px -8px ${accent}99`, color: '#fff' }}>{icon}</div>
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: C.ink2 }}>{body}</div>
    </div>
  );
}

// ── Лендинг ──────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [isLight, setIsLight] = useState(() => {
    const m = getStoredMode();
    return m === 'light' || (m === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches);
  });

  useEffect(() => {
    document.documentElement.classList.add('landing-scroll');
    return () => document.documentElement.classList.remove('landing-scroll');
  }, []);

  const toggleTheme = () => {
    const next = isLight ? 'dark' : 'light';
    applyThemeMode(next);
    setIsLight(!isLight);
  };

  const onDownload = () => {
    const dl = desktopDownload();
    if (dl.url) window.location.href = dl.url;
    else navigate('/auth');
  };
  const goAuth = () => navigate('/auth');

  const heroRadial = isLight
    ? 'radial-gradient(60% 50% at 20% -10%, rgba(66,230,206,0.22), transparent 60%), radial-gradient(55% 50% at 95% 10%, rgba(45,107,240,0.18), transparent 62%)'
    : 'radial-gradient(60% 50% at 18% -10%, rgba(45,107,240,0.22), transparent 60%), radial-gradient(50% 45% at 92% 8%, rgba(52,220,200,0.14), transparent 62%)';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, transition: 'background .3s', position: 'relative' }}>
      <OceanBackdrop />
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* NAV */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: C.panel, borderBottom: `1px solid ${C.hair}`, backdropFilter: 'blur(22px) saturate(160%)', WebkitBackdropFilter: 'blur(22px) saturate(160%)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', height: 70, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <OceanLogo size={34} />
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: C.ink }}>ocean</span>
          </div>
          <div style={{ flex: 1 }} />
          <div className="hidden md:flex" style={{ gap: 4, marginRight: 10 }}>
            {['Возможности', 'Безопасность', 'Звонки', 'Скачать'].map((l) => (
              <button key={l} onClick={onDownload} style={{ fontSize: 14.5, fontWeight: 600, color: C.ink2, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', borderRadius: 10 }}>{l}</button>
            ))}
          </div>
          <button onClick={toggleTheme} aria-label="Сменить тему" style={{ width: 40, height: 40, borderRadius: 12, background: C.raise, border: `1px solid ${C.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink2 }}>
            {isLight ? <Moon size={19} /> : <Sun size={19} />}
          </button>
          <Btn primary icon={<Download size={18} color="#fff" />} onClick={onDownload}>Скачать</Btn>
        </div>
      </div>

      {/* HERO */}
      <div style={{ position: 'relative', overflow: 'hidden', padding: '90px 24px 60px' }}>
        <div style={{ position: 'absolute', inset: 0, background: heroRadial, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
          <div style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto 48px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderRadius: 24, background: C.raise, border: `1px solid ${C.rim}`, fontSize: 13.5, fontWeight: 600, color: C.ink2, marginBottom: 26 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: C.online, boxShadow: `0 0 8px ${C.online}` }} />Новая версия 3.0 · Aurora
            </div>
            <h1 className="text-[44px] sm:text-[60px] lg:text-[76px]" style={{ margin: 0, lineHeight: 1.02, fontWeight: 800, letterSpacing: '-0.04em', color: C.ink }}>
              Сообщения, что<br />текут <span style={gradText}>плавно</span>
            </h1>
            <p style={{ fontSize: 20, lineHeight: 1.5, color: C.ink2, maxWidth: 600, margin: '24px auto 0' }}>
              Мессенджер, в котором всё ощущается как вода: переписка, звонки и голосовые — со сквозным шифрованием и идеальной синхронизацией на всех устройствах.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 34, flexWrap: 'wrap' }}>
              <Btn primary large icon={<AppleGlyph size={20} />} onClick={onDownload}>Скачать для Mac</Btn>
              <Btn large icon={<WindowsGlyph size={20} color="rgb(var(--content-rgb))" />} onClick={onDownload}>Для Windows</Btn>
            </div>
          </div>
          {/* кластер устройств — десктоп */}
          <div className="hidden lg:flex" style={{ position: 'relative', justifyContent: 'center', alignItems: 'flex-end', marginTop: 20 }}>
            <div style={{ transform: 'translateX(56px)' }}><WindowMock /></div>
            <div style={{ marginLeft: -150, marginBottom: -30, position: 'relative', zIndex: 4, animation: 'float 6s ease-in-out infinite' }}><PhoneMock isLight={isLight} /></div>
          </div>
          {/* мобайл — только телефон */}
          <div className="flex lg:hidden" style={{ justifyContent: 'center', marginTop: 8 }}>
            <div style={{ animation: 'float 6s ease-in-out infinite' }}><PhoneMock isLight={isLight} /></div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <Reveal>
      <div style={{ borderTop: `1px solid ${C.hair}`, borderBottom: `1px solid ${C.hair}`, background: C.panel }}>
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px', gap: 24 }}>
          {[['12M+', 'активных пользователей'], ['190', 'стран на борту'], ['99.99%', 'аптайм звонков'], ['0', 'данных на продажу']].map(([n, l], i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', ...gradText }}>{n}</div>
              <div style={{ fontSize: 14, color: C.ink2, marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      </Reveal>

      {/* FEATURES */}
      <Reveal>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '90px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="text-[34px] sm:text-[48px]" style={{ fontWeight: 800, letterSpacing: '-0.03em', color: C.ink, margin: 0 }}>Всё под одной волной</h2>
          <p style={{ fontSize: 18, color: C.ink2, marginTop: 12 }}>Спроектировано вокруг ощущения плавности и спокойствия.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 18 }}>
          <FeatureCard icon={<Lock size={25} />} accent="#16B6E0" title="Сквозное шифрование" body="Каждое сообщение, звонок и файл защищены по умолчанию. Ключи — только у вас и собеседника." />
          <FeatureCard icon={<Video size={25} />} accent="#2D6BF0" title="Кристальные звонки" body="HD-видео и аудио, которые держатся даже на слабой сети. До 50 участников в комнате." />
          <FeatureCard icon={<Mic size={25} />} accent="#13A99B" title="Голосовые волны" body="Голосовые с живой формой волны и распознаванием в текст одним касанием." />
          <FeatureCard icon={<Waves size={25} />} accent="#7A45E6" title="Плавная синхронизация" body="Начните на телефоне, продолжите на ПК. История течёт между устройствами без задержек, мгновенно и без потерь." wide />
          <FeatureCard icon={<Users size={25} />} accent="#FF9A3D" title="Группы и каналы" body="Сообщества до 200 000 участников с тихими упоминаниями и темами." />
        </div>
      </div>
      </Reveal>

      {/* SHOWCASE */}
      <Reveal>
      <div style={{ background: C.panel, borderTop: `1px solid ${C.hair}`, borderBottom: `1px solid ${C.hair}` }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px' }}>
          {[
            { tag: 'Две темы', title: 'Светлая днём, глубокая ночью', body: 'Тёплая морская пена или абиссальная синь — ocean подстраивается под время суток и ваше настроение одним переключателем.', icon: <Moon size={16} />, accent: '#2D6BF0', to: '#34DCC8', flip: false },
            { tag: 'Приватность', title: 'Ваши данные остаются вашими', body: 'Никакой рекламы, никакой продажи данных. Сквозное шифрование, исчезающие сообщения и блокировка скриншотов встроены в ядро.', icon: <Shield size={16} />, accent: '#13A99B', to: '#1E40C8', flip: true },
          ].map((r, i) => (
            <div key={i} className={`flex flex-col ${r.flip ? 'lg:flex-row-reverse' : 'lg:flex-row'}`} style={{ alignItems: 'center', gap: 64, padding: '48px 0' }}>
              <div style={{ flex: 1 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: r.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.icon}{r.tag}</span>
                <h3 className="text-[30px] sm:text-[38px]" style={{ fontWeight: 800, letterSpacing: '-0.03em', color: C.ink, margin: '14px 0 0', lineHeight: 1.1 }}>{r.title}</h3>
                <p style={{ fontSize: 17, lineHeight: 1.6, color: C.ink2, marginTop: 16, maxWidth: 440 }}>{r.body}</p>
              </div>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 360, maxWidth: '100%', height: 280, borderRadius: 24, background: `linear-gradient(150deg, ${r.accent}, ${r.to})`, position: 'relative', overflow: 'hidden', boxShadow: C.shadow }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 60% at 75% 15%, rgba(255,255,255,0.28), transparent 55%)' }} />
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(120deg, rgba(255,255,255,0.05) 0 18px, rgba(0,0,0,0.04) 18px 36px)' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><OceanLogo size={84} variant="flat" shadow={false} /></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </Reveal>

      {/* CTA */}
      <Reveal>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '90px 24px' }}>
        <div style={{ borderRadius: 32, background: GRAD, padding: '64px 32px', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 70% at 80% 0%, rgba(255,255,255,0.28), transparent 55%)' }} />
          <div style={{ position: 'absolute', bottom: -80, left: -40, width: 320, height: 320, borderRadius: '50%', border: '44px solid rgba(255,255,255,0.1)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}><OceanLogo size={72} variant="flat" shadow={false} /></div>
            <h2 className="text-[36px] sm:text-[52px]" style={{ fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', margin: '20px 0 0', lineHeight: 1.05 }}>Нырните в ocean</h2>
            <p style={{ fontSize: 19, color: 'rgba(255,255,255,0.9)', marginTop: 14, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>Бесплатно навсегда. Доступно на Mac, Windows, iOS и Android.</p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 30, flexWrap: 'wrap' }}>
              <button onClick={onDownload} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '15px 28px', borderRadius: 30, background: '#fff', color: '#0B2138', fontWeight: 700, fontSize: 16, border: 'none', cursor: 'pointer', boxShadow: '0 14px 30px -8px rgba(0,0,0,0.35)' }}><AppleGlyph size={20} color="#0B2138" />App Store</button>
              <button onClick={onDownload} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '15px 28px', borderRadius: 30, background: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 700, fontSize: 16, border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', backdropFilter: 'blur(8px)' }}><Download size={20} color="#fff" />Google Play</button>
            </div>
            <button onClick={goAuth} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 22, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.92)', fontWeight: 600, fontSize: 15 }}>Открыть в браузере <ArrowRight size={17} /></button>
          </div>
        </div>
      </div>
      </Reveal>

      {/* FOOTER */}
      <div style={{ borderTop: `1px solid ${C.hair}`, background: C.panel }}>
        <div className="grid grid-cols-2 md:grid-cols-5" style={{ maxWidth: 1200, margin: '0 auto', padding: '56px 24px 40px', gap: 32 }}>
          <div className="col-span-2 md:col-span-1">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}><OceanLogo size={32} /><span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: C.ink }}>ocean</span></div>
            <p style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.5, maxWidth: 220 }}>Мессенджер, что течёт плавно. Сделано с заботой о приватности.</p>
          </div>
          {[
            ['Продукт', ['Возможности', 'Безопасность', 'Звонки', 'Загрузить', 'Что нового']],
            ['Компания', ['О нас', 'Блог', 'Карьера', 'Пресс-кит']],
            ['Поддержка', ['Помощь', 'Статус', 'Связаться', 'API']],
            ['Право', ['Конфиденциальность', 'Условия', 'Шифрование']],
          ].map(([h, items], i) => (
            <div key={i}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>{h as string}</div>
              {(items as string[]).map((l) => <a key={l} href="#" onClick={(e) => e.preventDefault()} style={{ display: 'block', fontSize: 13.5, color: C.ink2, textDecoration: 'none', padding: '5px 0' }}>{l}</a>)}
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.hair}` }}>
          <div className="flex flex-col sm:flex-row" style={{ gap: 8, maxWidth: 1200, margin: '0 auto', padding: '20px 24px', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: C.ink3 }}>© 2026 ocean. Все права защищены.</span>
            <span style={{ fontSize: 13, color: C.ink3 }}>Сделано там, где встречаются волны 🌊</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
