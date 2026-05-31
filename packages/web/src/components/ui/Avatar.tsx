import { clsx } from 'clsx';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  className?: string;
}

const sizes = {
  sm:  { box: 'w-8 h-8',    text: 'text-xs',  dot: 'w-2 h-2' },
  md:  { box: 'w-10 h-10',  text: 'text-sm',  dot: 'w-2.5 h-2.5' },
  lg:  { box: 'w-12 h-12',  text: 'text-base', dot: 'w-3 h-3' },
  xl:  { box: 'w-16 h-16',  text: 'text-xl',  dot: 'w-3.5 h-3.5' },
};

// Deterministic color from name
function nameToColor(name: string): string {
  const colors = [
    'bg-rose-500', 'bg-pink-500', 'bg-fuchsia-500', 'bg-violet-500',
    'bg-indigo-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500',
    'bg-emerald-500', 'bg-green-500', 'bg-yellow-500', 'bg-orange-500',
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ src, name, size = 'md', online, className }: AvatarProps) {
  const s = sizes[size];
  const initials = name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={clsx('relative flex-shrink-0', className)}>
      <div className={clsx('rounded-full flex items-center justify-center overflow-hidden', s.box)}>
        {src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className={clsx('w-full h-full flex items-center justify-center font-semibold text-white', s.text, nameToColor(name))}>
            {initials}
          </div>
        )}
      </div>
      {online !== undefined && (
        <span className={clsx(
          'absolute bottom-0 right-0 rounded-full border-2 border-dark-surface',
          s.dot,
          online ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-white/25',
        )} />
      )}
    </div>
  );
}
