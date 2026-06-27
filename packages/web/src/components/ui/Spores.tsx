import { useMemo, type CSSProperties } from 'react';

/**
 * Биолюминесцентные споры-планктон — светящиеся частицы, дрейфуют и мерцают.
 * Фон «океана Пандоры» (только тёмная тема — родитель/CSS прячет в светлой
 * через класс `.spores-layer`). Детерминированный псевдо-рандом по seed.
 * Геометрия 1:1 из дизайн-хендоффа (ocean-ds.jsx → Spores).
 */
const COLORS = ['#5BF7DA', '#16E0E6', '#7AD0FF', '#B07BFF', '#FF6BE0'];

function sporeField(count: number, seed: number) {
  let x = seed * 7919 + 13;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  return Array.from({ length: count }, () => ({
    left: rnd() * 100,
    top: rnd() * 100,
    size: 2 + rnd() * 5,
    color: COLORS[Math.floor(rnd() * COLORS.length)],
    dur: 7 + rnd() * 11,
    delay: -rnd() * 14,
    drift: (rnd() * 2 - 1) * 26,
    op: 0.35 + rnd() * 0.5,
  }));
}

export default function Spores({
  count = 46,
  seed = 3,
  className = 'spores-layer',
  fixed = false,
}: {
  count?: number;
  seed?: number;
  className?: string;
  fixed?: boolean;
}) {
  const items = useMemo(() => sporeField(count, seed), [count, seed]);
  return (
    <div
      className={className}
      style={{ position: fixed ? 'fixed' : 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
      aria-hidden
    >
      {items.map((s, i) => (
        <span
          key={i}
          className="spore"
          style={{
            position: 'absolute',
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: s.color,
            boxShadow: `0 0 ${s.size * 2.5}px ${s.size * 0.8}px ${s.color}`,
            opacity: s.op,
            ['--drift']: `${s.drift}px`,
            animation: `sporeFloat ${s.dur}s ${s.delay}s ease-in-out infinite, sporeGlow ${s.dur * 0.5}s ${s.delay}s ease-in-out infinite`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
