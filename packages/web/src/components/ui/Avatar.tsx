import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  /** Градиентное брендовое кольцо вокруг аватара. */
  ring?: boolean;
  className?: string;
}

const sizes = {
  sm:  { box: 'w-8 h-8',    text: 'text-xs',  dot: 'w-2 h-2' },
  md:  { box: 'w-10 h-10',  text: 'text-sm',  dot: 'w-2.5 h-2.5' },
  lg:  { box: 'w-12 h-12',  text: 'text-base', dot: 'w-3 h-3' },
  xl:  { box: 'w-16 h-16',  text: 'text-xl',  dot: 'w-3.5 h-3.5' },
};

// Океанские акцент-градиенты (cool-доминантный набор + два тёплых «всплеска»),
// детерминированно по имени. Точные стопы из дизайн-хендоффа.
const ACCENT_GRADS = [
  'linear-gradient(150deg,#5DEBD6,#13B6BE)', // aqua
  'linear-gradient(150deg,#5BD2FF,#1689E0)', // cyan
  'linear-gradient(150deg,#6AA2FF,#2D5BF0)', // ocean
  'linear-gradient(150deg,#7E8CFF,#3B3FD0)', // deep
  'linear-gradient(150deg,#7FE6B0,#1F9E7C)', // kelp
  'linear-gradient(150deg,#C79CFF,#7A45E6)', // violet
  'linear-gradient(150deg,#FF9C8A,#FF5E78)', // coral (warm pop)
  'linear-gradient(150deg,#FFD58A,#FF9A3D)', // amber (warm pop)
];
function nameToAccent(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ACCENT_GRADS[Math.abs(hash) % ACCENT_GRADS.length];
}
const AVATAR_GLOSS = 'inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -8px 16px rgba(0,0,0,0.16)';

export default function Avatar({ src, name, size = 'md', online, ring, className }: AvatarProps) {
  const s = sizes[size];
  // Плавное проявление img — пока не загрузилась, держим opacity-0.
  const [loaded, setLoaded] = useState(false);
  // Если картинка не загрузилась (404/битый URL) — откатываемся на инициалы,
  // иначе был бы пустой прозрачный кружок. Сбрасываем при смене src.
  const [errored, setErrored] = useState(false);
  useEffect(() => { setLoaded(false); setErrored(false); }, [src]);
  const initials = name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const showImg = src && !errored;

  return (
    <div className={clsx('relative flex-shrink-0', className)}>
      <div
        className={clsx(
          'rounded-full flex items-center justify-center overflow-hidden',
          s.box,
          // Кольцо: градиентный padding-обод вокруг.
          ring && 'ring-gradient',
        )}
      >
        {showImg ? (
          <img
            // ref: если картинка уже в кэше, onLoad может НЕ сработать → аватар
            // остаётся невидимым (opacity-0) до перезагрузки. Проверяем complete.
            ref={(el) => { if (el && el.complete && el.naturalWidth > 0) setLoaded(true); }}
            src={src}
            alt={name}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={clsx(
              'w-full h-full object-cover rounded-full transition-opacity duration-300 ease-out',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        ) : (
          <div
            className={clsx('w-full h-full flex items-center justify-center font-semibold text-white rounded-full', s.text)}
            style={{ background: nameToAccent(name), boxShadow: AVATAR_GLOSS, textShadow: '0 1px 2px rgba(0,0,0,0.18)', letterSpacing: '-0.02em' }}
          >
            {initials}
          </div>
        )}
      </div>
      {online !== undefined && (
        <span
          className={clsx('absolute bottom-0 right-0 rounded-full border-2 border-dark-surface transition-colors duration-300', s.dot, !online && 'bg-content/25')}
          style={online ? { background: 'var(--online)', boxShadow: '0 0 8px rgba(52,220,200,0.7)' } : undefined}
        >
          {/* Мягкий пульс-ореол только для онлайна — океанский. */}
          {online && (
            <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(52,220,200,0.55)' }} />
          )}
        </span>
      )}
    </div>
  );
}
