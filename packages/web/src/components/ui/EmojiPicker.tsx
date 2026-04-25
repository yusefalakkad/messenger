/**
 * Простой пикер эмодзи — без внешних зависимостей.
 * Самые популярные эмодзи по категориям.
 */
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

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
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.12 }}
      className="absolute bottom-full mb-2 left-0 w-72 bg-dark-card border border-dark-border rounded-2xl shadow-2xl overflow-hidden z-30"
    >
      {/* Табы */}
      <div className="flex border-b border-dark-border px-1 pt-1 gap-0.5 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.name}
            onClick={() => setActiveTab(i)}
            className={`flex-shrink-0 w-9 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
              activeTab === i ? 'bg-dark-hover' : 'hover:bg-dark-hover/50'
            }`}
            title={cat.name}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Эмодзи */}
      <div className="h-48 overflow-y-auto p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {CATEGORIES[activeTab].emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { onSelect(emoji); }}
              className="w-8 h-8 flex items-center justify-center text-xl rounded-lg hover:bg-dark-hover transition-all hover:scale-110 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
