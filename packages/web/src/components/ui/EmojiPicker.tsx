/**
 * Простой пикер эмодзи — без внешних зависимостей.
 * Самые популярные эмодзи по категориям.
 */
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { menu } from '@/lib/motion';

const CATEGORIES = [
  { label: '😊', name: 'Смайлы', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👾','🤖','😺','😸','😹','😻'] },
  { label: '👋', name: 'Жесты', emojis: ['👍','👎','👌','🤌','✌️','🤞','🖖','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐','✋','🖕','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','👀','👁','👅','👄','💋','🦷','👣','💅'] },
  { label: '❤️', name: 'Сердца', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☯️','✡️','🔯','🛐','⛎'] },
  { label: '🐶', name: 'Животные', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦗','🦟','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭','🐊','🐅','🐆','🦓','🫏','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🦩'] },
  { label: '🍎', name: 'Еда', emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🧄','🧅','🥔','🌽','🥕','🧆','🥙','🧇','🥞','🧈','🍳','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥨','🧀','🥚','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'] },
  { label: '⚽', name: 'Спорт', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋','🤼','🤸','⛹','🤺','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🎗','🎫','🎟','🎪'] },
  { label: '✈️', name: 'Путешествия', emojis: ['🌍','🌎','🌏','🌐','🗺','🧭','🏔','⛰','🌋','🗻','🏕','🏖','🏜','🏝','🏞','🏟','🏛','🏗','🧱','🏘','🏚','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩','🕋','⛲','⛺','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','♨️','🎠','🛝','🎡','🎢','💈','🎪','🛎','🧳','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎','🏍','🛵','🛺','🚲','🛴','🛹','🚏','🛣','🛤','⛽','🚨','🚥','🚦','🛑','✈️','🛫','🛬','🛩','💺','🛸','🚁','🛶','⛵','🚤','🛥','🛳','⛴','🚢'] },
  { label: '💡', name: 'Объекты', emojis: ['⌚','📱','💻','⌨️','🖥','🖨','🖱','🖲','💽','💾','💿','📀','📷','📸','📹','🎥','📽','🎞','📞','☎️','📟','📠','📺','📻','🎙','🎚','🎛','🧭','⏱','⏲','⏰','🕰','⌛','⏳','📡','🔋','🪫','🔌','💡','🔦','🕯','🪔','🧯','🛢','💰','💴','💵','💶','💷','💸','💳','🪙','💎','⚖️','🦯','🔧','🪛','🔩','⚙️','🗜','🔗','⛓','🪝','🧲','🔫','🪃','🛡','🔨','🪚','🗡','⚔️','🪤','🪣','🔑','🗝','🔐','🔒','🔓','🪗','📦','📫','📪','📬','📭','📮','🗳','✏️','✒️','🖋','🖊','📝','📁','📂','🗂','📅','📆','🗒','🗓','📇','📈','📉','📊','📋','📌','📍','✂️','🗃','🗄','🗑','🔏','📃','📜','📄','📑','🧾','📊','📈','📉','🗞','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🏷','💰'] },
];

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <motion.div
      ref={ref}
      variants={menu}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ transformOrigin: 'bottom left' }}
      className="absolute bottom-full mb-2 left-0 w-72 surface-2 rounded-xl shadow-e3 overflow-hidden z-dropdown"
    >
      {/* Табы категорий */}
      <div className="flex border-b border-dark-border px-1.5 pt-1.5 pb-1 gap-0.5 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map((cat, i) => (
          <motion.button
            key={cat.name}
            onClick={() => setActiveTab(i)}
            whileTap={{ scale: 0.9 }}
            className={`relative flex-shrink-0 w-9 h-9 rounded-lg text-base flex items-center justify-center transition-colors ${
              activeTab === i ? 'bg-dark-card text-content' : 'text-content/70 hover:bg-content/[0.05]'
            }`}
            title={cat.name}
          >
            {cat.label}
            {/* Активный индикатор-полоска снизу */}
            {activeTab === i && (
              <motion.span
                layoutId="emoji-tab"
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-brand-gradient"
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      {/* Эмодзи */}
      <div className="h-48 overflow-y-auto p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {CATEGORIES[activeTab].emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { onSelect(emoji); }}
              className="w-8 h-8 flex items-center justify-center text-xl rounded-lg hover:bg-content/[0.07] transition-all hover:scale-[1.18] active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
