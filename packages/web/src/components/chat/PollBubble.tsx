import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { votePoll } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';
import { SPRING, tapSoft } from '@/lib/motion';
import type { Message } from '@messenger/shared';

interface Props {
  message: Message;
  isOwn: boolean;
  chatId: string;
}

// Склонение «голос/голоса/голосов»
function votesLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} голос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} голоса`;
  return `${n} голосов`;
}

export default function PollBubble({ message, isOwn, chatId }: Props) {
  const myUserId = useAuthStore((s) => s.user?.id);
  const poll = message.poll;
  if (!poll) return null;

  // Мои выбранные опции
  const myOptionIds = new Set(
    poll.votes.filter((v) => v.userId === myUserId).map((v) => v.optionId),
  );
  // Уникальные проголосовавшие
  const voterCount = new Set(poll.votes.map((v) => v.userId)).size;
  const voted = myOptionIds.size > 0;

  const vote = (optionId: string) => {
    if (poll.multiple) {
      // toggle опции в моём наборе, отправляем весь набор
      const next = new Set(myOptionIds);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      votePoll(chatId, poll.id, [...next]);
    } else {
      votePoll(chatId, poll.id, [optionId]);
    }
  };

  return (
    <div className="w-[260px] max-w-full">
      <p className="text-[15px] font-semibold leading-snug break-words">{poll.question}</p>
      {/* Мета: тип + кол-во голосов; для множественного выбора — подсказка. */}
      <p className="text-xs text-content/50 mt-0.5 mb-2.5 flex items-center gap-1.5">
        <span className="tabular-nums">{votesLabel(voterCount)}</span>
        {poll.multiple && (
          <>
            <span className="text-content/25">·</span>
            <span>Несколько вариантов</span>
          </>
        )}
      </p>

      <div className="flex flex-col gap-2">
        {poll.options.map((opt) => {
          const count = poll.votes.filter((v) => v.optionId === opt.id).length;
          const percent = voterCount > 0 ? Math.round((count / voterCount) * 100) : 0;
          const mine = myOptionIds.has(opt.id);

          return (
            <motion.button
              key={opt.id}
              onClick={() => vote(opt.id)}
              whileTap={tapSoft}
              className={clsx(
                'group relative h-11 w-full rounded-lg overflow-hidden text-left',
                'border transition-colors duration-200',
                mine
                  ? 'border-primary-400/40 bg-primary-500/[0.06]'
                  : 'border-content/[0.07] hover:border-content/[0.14] hover:bg-content/[0.03]',
              )}
            >
              {/* Премиум прогресс-бар: плавная анимация ширины при голосовании. */}
              <motion.div
                className={clsx(
                  'absolute inset-y-0 left-0 rounded-lg',
                  mine
                    ? 'bg-gradient-to-r from-primary-500/35 to-accent-pink/25'
                    : 'bg-content/[0.08]',
                )}
                initial={false}
                animate={{ width: `${percent}%` }}
                transition={voted ? SPRING.smooth : { duration: 0 }}
              />
              <div className="relative h-full flex items-center gap-2 px-3">
                {/* Чек только для выбранных мной опций. */}
                {mine && (
                  <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-brand-gradient shadow-glow-violet">
                    <Check size={11} strokeWidth={3} className="text-white" />
                  </span>
                )}
                <span className={clsx(
                  'flex-1 text-sm truncate',
                  mine ? 'text-content font-medium' : 'text-content/85',
                )}>
                  {opt.text}
                </span>
                <span className={clsx(
                  'text-[13px] tabular-nums shrink-0 transition-colors',
                  mine ? 'text-white font-semibold' : 'text-content/60',
                )}>
                  {percent}%
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
