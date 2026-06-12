/**
 * GIF-пикер на Tenor API v2.
 * Без ключа VITE_TENOR_API_KEY показывает заглушку с подсказкой.
 */
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, ImageOff, AlertCircle } from 'lucide-react';
import { menu } from '@/lib/motion';

const KEY = (import.meta as any).env?.VITE_TENOR_API_KEY as string | undefined;

// Минимальная типизация ответа Tenor v2
interface TenorMedia {
  url: string;
  dims: [number, number];
}
interface TenorResult {
  id: string;
  media_formats: {
    gif?: TenorMedia;
    tinygif?: TenorMedia;
  };
}
interface TenorResponse {
  results: TenorResult[];
}

interface Props {
  onSelect: (gif: { url: string; width: number; height: number }) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenorResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Закрытие по клику снаружи (как в EmojiPicker)
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  // Загрузка GIF: пустой запрос → featured, иначе search (debounce 400мс)
  useEffect(() => {
    if (!KEY) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const base = query.trim()
          ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query.trim())}`
          : 'https://tenor.googleapis.com/v2/featured?';
        const res = await fetch(
          `${base}&key=${KEY}&limit=24&media_filter=gif,tinygif`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error('tenor http error');
        const data = (await res.json()) as TenorResponse;
        setResults(data.results ?? []);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(true);
      } finally {
        setLoading(false);
      }
    }, query ? 400 : 0);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const handlePick = (r: TenorResult) => {
    const gif = r.media_formats.gif ?? r.media_formats.tinygif;
    if (!gif) return;
    onSelect({ url: gif.url, width: gif.dims[0], height: gif.dims[1] });
    onClose();
  };

  // Нет ключа — панель-заглушка
  if (!KEY) {
    return (
      <motion.div
        ref={ref}
        variants={menu}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{ transformOrigin: 'bottom left' }}
        className="absolute bottom-full mb-2 left-0 w-[320px] surface-2 rounded-xl shadow-e3 p-5 flex flex-col items-center gap-3 z-dropdown"
      >
        <div className="w-12 h-12 rounded-2xl bg-brand-gradient-soft border border-dark-border flex items-center justify-center shadow-glow-soft">
          <ImageOff size={22} className="text-content/70" />
        </div>
        <p className="text-[13px] text-content/55 text-center leading-5">
          GIF недоступны — добавьте<br /><code className="text-content/70">VITE_TENOR_API_KEY</code> в .env
        </p>
        <button className="btn-secondary btn-sm" onClick={onClose}>
          Закрыть
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      variants={menu}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ transformOrigin: 'bottom left' }}
      className="absolute bottom-full mb-2 left-0 w-[320px] h-[400px] surface-2 rounded-xl shadow-e3 overflow-hidden flex flex-col z-dropdown"
    >
      {/* Поиск */}
      <div className="p-2 border-b border-dark-border flex-shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content/40 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск GIF"
            autoFocus
            className="input-pill w-full pl-9"
          />
        </div>
      </div>

      {/* Контент */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-brand-gradient-soft border border-dark-border flex items-center justify-center">
              <AlertCircle size={22} className="text-content/70" />
            </div>
            <p className="text-[13px] text-content/55">Не удалось загрузить</p>
          </div>
        ) : loading && results.length === 0 ? (
          // Skeleton-плейсхолдеры вместо голого спиннера
          <div className="columns-2 gap-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skeleton rounded-md w-full mb-1"
                style={{ height: 70 + (i % 4) * 28 }}
              />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-brand-gradient-soft border border-dark-border flex items-center justify-center">
              <Search size={22} className="text-content/70" />
            </div>
            <p className="text-[13px] text-content/55">Ничего не найдено</p>
          </div>
        ) : (
          <div className="columns-2 gap-1 p-2">
            {results.map((r) =>
              r.media_formats.tinygif ? (
                <img
                  key={r.id}
                  src={r.media_formats.tinygif.url}
                  alt="GIF"
                  loading="lazy"
                  onClick={() => handlePick(r)}
                  className="rounded-md w-full mb-1 cursor-pointer ring-1 ring-transparent hover:ring-primary-500/50 hover:brightness-110 transition-all duration-200"
                />
              ) : null,
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
