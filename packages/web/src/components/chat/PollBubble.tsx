import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { votePoll } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';
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
      <p className="text-xs text-white/55 mt-0.5 mb-2">
        Опрос · {votesLabel(voterCount)}
      </p>

      <div className="flex flex-col gap-1.5">
        {poll.options.map((opt) => {
          const count = poll.votes.filter((v) => v.optionId === opt.id).length;
          const percent = voterCount > 0 ? Math.round((count / voterCount) * 100) : 0;
          const mine = myOptionIds.has(opt.id);

          return (
            <button
              key={opt.id}
              onClick={() => vote(opt.id)}
              className="relative h-11 rounded-md overflow-hidden text-left hover:brightness-110 transition"
            >
              {/* Прогресс-бар фоном */}
              <div
                className={clsx(
                  'absolute inset-y-0 left-0 transition-all duration-300 ease-out rounded-md',
                  mine ? 'bg-primary-500/25' : 'bg-white/10',
                )}
                style={{ width: `${percent}%` }}
              />
              <div className="relative h-full flex items-center gap-2 px-3">
                {mine && (
                  <Check
                    size={16}
                    className={clsx('shrink-0', isOwn ? 'text-white' : 'text-primary-300')}
                  />
                )}
                <span className="flex-1 text-sm truncate">{opt.text}</span>
                <span className="text-[13px] tabular-nums text-white/65 shrink-0">
                  {percent}%
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
