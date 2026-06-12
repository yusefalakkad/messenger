import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import { backdrop, popIn, tap, SPRING } from '@/lib/motion';

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
    // Подложка — z-overlay
    <motion.div
      variants={backdrop}
      initial="hidden" animate="visible" exit="exit"
      className="fixed inset-0 z-overlay flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Карточка — z-modal */}
      <motion.div
        variants={popIn}
        initial="hidden" animate="visible" exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="relative z-modal glass-card rounded-2xl shadow-e3 w-full max-w-sm overflow-hidden"
      >
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-spot-violet blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
            <h3 className="font-semibold">Создать опрос</h3>
            <motion.button
              whileTap={tap}
              transition={SPRING.snappy}
              onClick={onClose}
              className="btn-icon btn-icon-sm"
              aria-label="Закрыть"
            >
              <X size={16} />
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
                      className="btn-icon btn-icon-sm flex-shrink-0"
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
                  className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-300 hover:text-primary-500 dark:hover:text-primary-200 py-2 px-1 transition self-start"
                >
                  <Plus size={16} />
                  Добавить опцию
                </button>
              )}
            </div>

            <button
              onClick={() => setMultiple((v) => !v)}
              className="flex items-center gap-2.5 py-2 px-1 text-sm text-content/80 self-start"
            >
              <span
                className={clsx(
                  'w-5 h-5 rounded-md border flex items-center justify-center transition',
                  multiple
                    ? 'bg-brand-gradient border-transparent shadow-glow-violet'
                    : 'border-dark-border bg-content/[0.04]',
                )}
              >
                {multiple && <Check size={14} className="text-white" />}
              </span>
              Несколько ответов
            </button>

            {error && <p className="text-[13px] text-red-400">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 px-4 pb-4 pt-1">
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
