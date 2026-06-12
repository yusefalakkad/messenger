import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/lib/api';

interface Props {
  chatId: string;
  onClose: () => void;
}

export default function PollCreateModal({ chatId, onClose }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledOptions = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && filledOptions.length >= 2 && !submitting;

  const setOption = (idx: number, value: string) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));

  const removeOption = (idx: number) =>
    setOptions((prev) => prev.filter((_, i) => i !== idx));

  const addOption = () => setOptions((prev) => (prev.length < 10 ? [...prev, ''] : prev));

  const create = async () => {
    if (!canCreate) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/chats/${chatId}/polls`, {
        question: question.trim(),
        options: filledOptions,
        multiple,
      });
      // message:new придёт по сокету
      onClose();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message ?? 'Не удалось создать опрос',
      );
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-sm overflow-hidden relative"
      >
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-spot-violet blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
            <h2 className="font-semibold">Создать опрос</h2>
            <motion.button
              whileTap={{ scale: 0.9 }}
              whileHover={{ rotate: 90 }}
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.07] text-white/60"
            >
              <X size={18} />
            </motion.button>
          </div>

          <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
            <input
              autoFocus
              className="input-base w-full"
              placeholder="Вопрос"
              maxLength={300}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />

            <div className="flex flex-col gap-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    className="input-pill flex-1"
                    placeholder={`Опция ${idx + 1}`}
                    maxLength={100}
                    value={opt}
                    onChange={(e) => setOption(idx, e.target.value)}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(idx)}
                      className="p-2 rounded-lg hover:bg-white/[0.07] text-white/45 hover:text-white/80 transition"
                      aria-label="Удалить опцию"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button
                  onClick={addOption}
                  className="flex items-center gap-1.5 text-sm text-primary-300 hover:text-primary-200 py-2 px-1 transition self-start"
                >
                  <Plus size={16} />
                  Добавить опцию
                </button>
              )}
            </div>

            <button
              onClick={() => setMultiple((v) => !v)}
              className="flex items-center gap-2.5 py-2 px-1 text-sm text-white/80 self-start"
            >
              <span
                className={clsx(
                  'w-5 h-5 rounded-md border flex items-center justify-center transition',
                  multiple
                    ? 'bg-primary-500 border-primary-500'
                    : 'border-dark-border bg-white/[0.04]',
                )}
              >
                {multiple && <Check size={14} className="text-white" />}
              </span>
              Несколько ответов
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 px-4 pb-4">
            <button className="btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn-primary" disabled={!canCreate} onClick={create}>
              Создать
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
