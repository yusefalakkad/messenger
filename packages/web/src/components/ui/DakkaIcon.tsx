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
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role="img"
      aria-label="Dakka"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#FF7A78" />
          <stop offset="46%"  stopColor="#FF4E86" />
          <stop offset="100%" stopColor="#7A82FF" />
        </linearGradient>
      </defs>

      {/* Спич-бабл с хвостиком слева-снизу (новый бренд, точно по референсу). */}
      <path
        d="M50 14C28.4 14 11 28.7 11 46.8c0 9.9 5.2 18.8 13.4 24.8 0 4.6-1.6 10.3-5.1 15.2 7.6-.7 15.2-3.4 21-7.7 3.1.7 6.3 1 9.7 1 21.6 0 39-14.7 39-32.8S71.6 14 50 14z"
        fill={`url(#${gradId})`}
      />

      {/* 5 белых вертикальных «пилюль» — sound-wave / голос (по референсу). */}
      <g fill="white">
        <rect x="33" y="38" width="5" height="16" rx="2.5" />
        <rect x="41" y="31" width="5" height="30" rx="2.5" />
        <rect x="49" y="35" width="5" height="22" rx="2.5" />
        <rect x="57" y="29" width="5" height="34" rx="2.5" />
        <rect x="65" y="39" width="5" height="14" rx="2.5" />
      </g>
    </svg>
  );
}
