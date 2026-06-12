/**
 * GIF-пикер на Tenor API v2.
 * Без ключа VITE_TENOR_API_KEY показывает заглушку с подсказкой.
 */
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';

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
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        className="absolute bottom-full mb-2 left-0 w-[320px] rounded-xl bg-dark-surface border border-dark-border shadow-e3 p-4 flex flex-col items-center gap-3 z-30"
      >
        <p className="text-[13px] text-white/55 text-center">
          GIF недоступны: добавьте VITE_TENOR_API_KEY в .env
        </p>
        <button className="btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      className="absolute bottom-full mb-2 left-0 w-[320px] h-[400px] rounded-xl bg-dark-surface border border-dark-border shadow-e3 overflow-hidden flex flex-col z-30"
    >
      {/* Поиск */}
      <div className="p-2 border-b border-dark-border">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
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
          <div className="h-full flex items-center justify-center">
            <p className="text-[13px] text-white/55">Не удалось загрузить</p>
          </div>
        ) : loading && results.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[13px] text-white/55">Загрузка…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[13px] text-white/55">Ничего не найдено</p>
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
                  className="rounded-md w-full mb-1 cursor-pointer hover:opacity-80 transition-opacity"
                />
              ) : null,
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
