import { useId } from 'react';

/**
 * Брендовая иконка Dakka — спич-бабл с градиентом и 4-полосным саундвейвом.
 * Сама форма пузыря = иконка (не прямоугольная подложка). Используется везде,
 * где раньше был `rounded-3xl bg-brand-gradient` с белым chat-icon внутри.
 *
 * viewBox 0 0 64 64 — масштабируется через `size`.
 * Каждый инстанс получает уникальный gradient-id через useId.
 */
export default function DakkaIcon({
  size = 64,
  className,
}: { size?: number; className?: string }) {
  const id = useId();
  const gradId = `dakka-grad-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Dakka"
    >
      <defs>
        <linearGradient id={gradId} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%"   stopColor="#8a52ff" />
          <stop offset="55%"  stopColor="#d04df0" />
          <stop offset="100%" stopColor="#ff5a8f" />
        </linearGradient>
      </defs>

      {/* Круглый спич-бабл с мягким хвостиком слева-снизу (округлый бренд). */}
      <path
        d="M32 6 A26 26 0 1 1 18 53 C14 58 9 59 11 58 C14 55 14 52 13 50 A26 26 0 0 1 32 6 Z"
        fill={`url(#${gradId})`}
      />

      {/* 4 белых вертикальных «пилюли» — sound-wave / голос. */}
      <g fill="white">
        <rect x="21" y="24" width="3.5" height="12" rx="1.75" />
        <rect x="28" y="19" width="3.5" height="22" rx="1.75" />
        <rect x="35" y="22" width="3.5" height="16" rx="1.75" />
        <rect x="42" y="26" width="3.5" height="8"  rx="1.75" />
      </g>
    </svg>
  );
}
