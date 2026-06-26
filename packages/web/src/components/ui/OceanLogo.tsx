import { useId } from 'react';

/**
 * Логотип ocean — чат-бабл с одной океанской волной, вписанный в squircle.
 * Точная геометрия из дизайн-хендоффа (viewBox 0 0 100 100).
 *
 * Варианты:
 *  • gradient (основной) — squircle залит океанским градиентом; белый бабл
 *    с вырезанной волной (mask).
 *  • glass — тёмная подложка #0A1019 + обводка; бабл градиентом, волна цветом фона.
 *  • flat — только белый бабл с вырезанной волной (одноцветное применение).
 *
 * API совместим со старым DakkaIcon: <OceanLogo size className />. По умолчанию
 * — gradient. Каждый инстанс получает уникальные id градиента/маски (useId).
 */

const SQUIRCLE = 'M50 1.5C13 1.5 1.5 13 1.5 50S13 98.5 50 98.5 98.5 87 98.5 50 87 1.5 50 1.5z';
const BUBBLE = 'M50 16C29.6 16 13 29.7 13 46.8c0 9.2 4.8 17.4 12.3 23 .1 4.3-1.4 9.6-4.7 14.2 7-.6 14-3.1 19.4-7.1 3.1.8 6.4 1.1 9.9 1.1 20.4 0 37-13.7 37-30.8S70.4 16 50 16z';
const WAVE_ONE = 'M29 47c5.5-7 11-7 16.5 0 4.6 6 10 6 14.5 0 3.7-4.6 7.4-5.5 10-3';

const OCEAN_STOPS: { o: string; c: string }[] = [
  { o: '0%', c: '#42E6CE' },
  { o: '40%', c: '#16B6E0' },
  { o: '74%', c: '#2D6BF0' },
  { o: '100%', c: '#1E40C8' },
];

export type OceanLogoVariant = 'gradient' | 'glass' | 'flat';

export default function OceanLogo({
  size = 64,
  className,
  variant = 'gradient',
  shadow = true,
}: {
  size?: number;
  className?: string;
  variant?: OceanLogoVariant;
  shadow?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const gid = `og-${uid}`;
  const mid = `om-${uid}`;

  const dropShadow =
    shadow && variant !== 'flat'
      ? `drop-shadow(0 ${size * 0.08}px ${size * 0.2}px rgba(22,120,200,0.4))`
      : undefined;

  if (variant === 'flat') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className={className} role="img" aria-label="ocean">
        <defs>
          <mask id={mid}>
            <path d={BUBBLE} fill="#fff" />
            <path d={WAVE_ONE} fill="none" stroke="#000" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
          </mask>
        </defs>
        <path d={BUBBLE} fill="#fff" mask={`url(#${mid})`} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="ocean"
      style={dropShadow ? { filter: dropShadow } : undefined}
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          {OCEAN_STOPS.map((s, i) => (
            <stop key={i} offset={s.o} stopColor={s.c} />
          ))}
        </linearGradient>
        <mask id={mid}>
          <path d={BUBBLE} fill="#fff" />
          <path d={WAVE_ONE} fill="none" stroke="#000" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>

      <path d={SQUIRCLE} fill={variant === 'glass' ? '#0A1019' : `url(#${gid})`} />
      <path d={SQUIRCLE} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />

      {variant === 'glass' ? (
        <g transform="translate(7 6) scale(0.86)">
          <path d={BUBBLE} fill={`url(#${gid})`} />
          <path d={WAVE_ONE} fill="none" stroke="#0A1019" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : (
        <g transform="translate(7 6) scale(0.86)">
          <path d={BUBBLE} fill="#fff" mask={`url(#${mid})`} />
        </g>
      )}
    </svg>
  );
}
