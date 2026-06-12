import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// Ответ бэкенда GET /og-preview?url=...
interface OgPreviewData {
  url: string;
  siteName?: string | null;
  title?: string | null;
  description?: string | null;
  image?: string | null;
}

// Module-level кэш: результат по url + промисы in-flight запросов,
// чтобы ре-рендеры/виртуализация списка не дублировали сетевые запросы.
// null в кэше = превью недоступно (404 / нет OG-тегов) — больше не запрашиваем.
const previewCache = new Map<string, OgPreviewData | null>();
const inflight = new Map<string, Promise<OgPreviewData | null>>();

function fetchPreview(url: string): Promise<OgPreviewData | null> {
  const cached = previewCache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = api
    .get<{ data: OgPreviewData }>('/og-preview', { params: { url } })
    .then((res) => {
      const data = res.data?.data ?? null;
      // Без title карточка бессмысленна — считаем что превью нет
      const result = data && data.title ? data : null;
      previewCache.set(url, result);
      return result;
    })
    .catch(() => {
      previewCache.set(url, null);
      return null;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, promise);
  return promise;
}

interface LinkPreviewProps {
  url: string;
  isOwn?: boolean;
}

export function LinkPreview({ url, isOwn }: LinkPreviewProps) {
  const [preview, setPreview] = useState<OgPreviewData | null>(
    () => previewCache.get(url) ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchPreview(url).then((data) => {
      if (!cancelled) setPreview(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Пока грузится или превью нет — ничего не рендерим (без скелетона,
  // чтобы пузырь сообщения не прыгал зря)
  if (!preview) return null;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') window.open(url, '_blank', 'noopener,noreferrer');
      }}
      className="flex gap-2 mt-1.5 p-2 rounded-lg cursor-pointer hover:bg-white/[0.04] transition-colors duration-200 max-w-full overflow-hidden"
    >
      {/* Вертикальная полоска-акцент */}
      <div
        className={`w-0.5 shrink-0 rounded-full self-stretch ${
          isOwn ? 'bg-white/60' : 'bg-primary-400'
        }`}
      />
      <div className="min-w-0 flex-1">
        {preview.siteName && (
          <div
            className={`text-xs font-medium truncate ${
              isOwn ? 'text-white/70' : 'text-primary-300'
            }`}
          >
            {preview.siteName}
          </div>
        )}
        <div className="text-[13px] font-semibold leading-snug line-clamp-2">
          {preview.title}
        </div>
        {preview.description && (
          <div className="text-xs text-white/60 leading-snug line-clamp-2">
            {preview.description}
          </div>
        )}
        {preview.image && (
          <img
            src={preview.image}
            alt=""
            loading="lazy"
            className="mt-1.5 rounded-md max-h-40 w-full object-cover"
            onError={(e) => {
              // Битая картинка — прячем, текстовая часть карточки остаётся
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </div>
    </div>
  );
}
