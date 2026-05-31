import { motion } from 'framer-motion';
import { useChatStore } from '@/stores/chat.store';

interface Props { chatId: string; }

export default function TypingIndicator({ chatId }: Props) {
  const typingUsers = useChatStore((s) => s.typingUsers[chatId]);
  if (!typingUsers || typingUsers.size === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex items-end gap-2 mb-1"
    >
      <div className="w-8 flex-shrink-0" />
      <div className="bubble-in px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </motion.div>
  );
}
