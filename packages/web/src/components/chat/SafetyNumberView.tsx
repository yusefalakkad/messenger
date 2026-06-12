import { useEffect, useState } from 'react';
import { ShieldCheck, ChevronDown, QrCode as QrIcon, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { computeSafetyNumber } from '@/lib/safetyNumber';

interface Props { myPublicKey: string; theirPublicKey: string; chatId: string; }

const verifiedKey = (chatId: string) => `safety:verified:${chatId}`;

export default function SafetyNumberView({ myPublicKey, theirPublicKey, chatId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [number,   setNumber]   = useState<string>('');
  const [qr,       setQr]       = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean>(() => {
    try { return localStorage.getItem(verifiedKey(chatId)) === '1'; } catch { return false; }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const n = await computeSafetyNumber(myPublicKey, theirPublicKey);
        if (!cancelled) setNumber(n);
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, [myPublicKey, theirPublicKey]);

  useEffect(() => {
    if (!expanded || !number || qr) return;
    QRCode.toDataURL(number.replace(/\s/g, ''), { margin: 1, scale: 4 })
      .then((url) => setQr(url))
      .catch(() => {});
  }, [expanded, number, qr]);

  const toggleVerified = () => {
    const next = !verified;
    setVerified(next);
    try {
      if (next) localStorage.setItem(verifiedKey(chatId), '1');
      else      localStorage.removeItem(verifiedKey(chatId));
    } catch { /* */ }
  };

  return (
    <div className="border-b border-dark-border/60">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors text-left"
      >
        <ShieldCheck size={18} className={verified ? 'text-green-400' : 'text-primary-400'} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Безопасность</p>
          <p className="text-xs text-content/45 mt-0.5">
            {verified ? 'Ключи сверены' : 'Сверить отпечатки ключей'}
          </p>
        </div>
        <ChevronDown size={16} className={`text-content/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-content/55 leading-relaxed">
                Это число должно быть одинаковым у вас и у собеседника. Если совпадают —
                ключи не были подменены сервером. Сверьте лично, по видеозвонку или сравните QR-коды.
              </p>

              {/* Отпечаток */}
              <div className="bg-dark-bg border border-dark-border rounded-2xl p-3">
                <div className="font-mono text-sm leading-relaxed tracking-wider text-content/90 break-all text-center">
                  {number || '...'}
                </div>
              </div>

              {/* QR */}
              {qr && (
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-white p-2 rounded-2xl">
                    <img src={qr} alt="QR" className="w-40 h-40" />
                  </div>
                  <p className="text-[10px] text-content/30 flex items-center gap-1">
                    <QrIcon size={10} /> Сравните QR с устройством собеседника
                  </p>
                </div>
              )}

              <button
                onClick={toggleVerified}
                className={`w-full py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  verified
                    ? 'bg-green-500/15 text-green-400 hover:bg-green-500/20'
                    : 'bg-dark-hover hover:bg-dark-border'
                }`}
              >
                {verified ? <><Check size={14} /> Отмечено как сверенное</> : 'Отметить как сверенное'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
