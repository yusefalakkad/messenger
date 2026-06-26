/**
 * Сжатие изображений в браузере ПЕРЕД загрузкой.
 *
 * Зачем: экономит диск/трафик сервера (важно на слабом VPS) и ускоряет
 * отправку фото на мобильном интернете. Как в WhatsApp/Telegram — фото
 * ужимается до разумного размера, оригинал в полном разрешении не гоняется.
 *
 * Что делает: уменьшает до 1920px по длинной стороне и перекодирует в JPEG
 * q0.82. Анимированные GIF и уже-маленькие файлы не трогает. Любой сбой —
 * молча возвращает оригинал (отправка не должна ломаться из-за сжатия).
 */

const MAX_DIMENSION = 1920;       // длинная сторона
const QUALITY = 0.82;             // баланс качество/размер для фото
const MIN_SIZE_TO_COMPRESS = 400 * 1024; // < 400 КБ — смысла нет

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;          // анимацию убивать нельзя
  if (file.size < MIN_SIZE_TO_COMPRESS) return file;

  try {
    // imageOrientation: 'from-image' — учитываем EXIF-поворот (фото с телефона)
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    const canvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });

    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) { bitmap.close(); return file; }

    // JPEG не умеет прозрачность → подкладываем белый фон
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob: Blob | null = useOffscreen
      ? await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: QUALITY })
      : await new Promise((resolve) =>
          (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', QUALITY),
        );

    // Не помогло (уже оптимизированный файл) — оставляем оригинал
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
