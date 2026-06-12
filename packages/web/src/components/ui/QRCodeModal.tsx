import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { toast } from '@/lib/toast';

interface QRCodeModalProps {
  /** Значение, зашитое в QR (обычно ссылка) */
  value: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

/**
 * Модалка с QR-кодом: профиль по username, инвайт-ссылка канала и т.п.
 * QR генерируется на клиенте через qrcode.toDataURL.
 */
export default function QRCodeModal({ value, title, subtitle, onClose }: QRCodeModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: 280, margin: 2 })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [value]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-overlay flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }}
        className="relative z-modal w-full max-w-xs rounded-xl bg-dark-card border border-dark-border p-6 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="text-[15px] font-semibold text-content text-center">{title}</h4>

        {/* QR на белой подложке — иначе сканеры не читают на тёмном фоне */}
        <div className="rounded-lg bg-white p-3">
          {dataUrl ? (
            <img src={dataUrl} alt="QR-код" className="w-[220px] h-[220px]" draggable={false} />
          ) : (
            <div className="w-[220px] h-[220px] flex items-center justify-center">
              {failed ? (
                <QrCode size={32} className="text-black/40" />
              ) : (
                <div className="w-8 h-8 rounded-full border-2 border-black/15 border-t-black/50 animate-spin" />
              )}
            </div>
          )}
        </div>

        {failed && (
          <p className="text-[13px] text-red-400 text-center">Не удалось сгенерировать QR-код</p>
        )}

        {subtitle && (
          <p className="text-[13px] text-content/55 truncate max-w-full" title={subtitle}>{subtitle}</p>
        )}

        <button type="button" className="btn-secondary btn-block" onClick={copyLink}>
          <Copy size={16} />
          Копировать ссылку
        </button>
      </motion.div>
    </motion.div>
  );
}
