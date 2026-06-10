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

      {/* Спич-бабл с хвостиком слева-снизу.
          Главный корпус — скруглённый квадрат, тэйл — небольшой треугольный «носик». */}
      <path
        d="M16 6 H48 C53.5 6 58 10.5 58 16 V40 C58 45.5 53.5 50 48 50 H26
           L13 60 C12 60.6 10.8 59.7 11 58.5 L13 50 H16
           C10.5 50 6 45.5 6 40 V16 C6 10.5 10.5 6 16 6 Z"
        fill={`url(#${gradId})`}
      />

      {/* 4 белых вертикальных «пилюли» — sound-wave / голос. */}
      <g fill="white">
        <rect x="20" y="22" width="3.5" height="12" rx="1.75" />
        <rect x="27" y="17" width="3.5" height="22" rx="1.75" />
        <rect x="34" y="20" width="3.5" height="16" rx="1.75" />
        <rect x="41" y="24" width="3.5" height="8"  rx="1.75" />
      </g>
    </svg>
  );
}
