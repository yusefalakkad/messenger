import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { motion, useSpring, useVelocity, useTransform } from 'framer-motion';
import { Phone, Users, Settings, MessageCircle } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useChatStore } from '@/stores/chat.store';
import { haptic } from '@/lib/native';
import { SPRING, tap } from '@/lib/motion';

/**
 * Нижняя навигация для телефона — ПЛАВАЮЩАЯ округлая капсула ПОВЕРХ контента
 * (полупрозрачное жидкое стекло с тусклым фирменным оттенком, без заливки).
 * Только на мобиле (`lg:hidden`); внутри чата её прячет ChatPage. Контент под
 * ней просвечивает — поэтому списки получают нижний отступ (pb), чтобы не
 * прятались за капсулой.
 *
 * Вкладки: Контакты · Звонки · Чаты · Настройки. Поиска тут нет — он в шапке.
 * Под активной едет мягкая пилюля (layoutId + spring).
 */
type TabKey = 'contacts' | 'calls' | 'chats' | 'settings';

const TABS: { key: TabKey; i18nKey: string; Icon: typeof Users }[] = [
  { key: 'contacts', i18nKey: 'nav.contacts', Icon: Users },
  { key: 'calls',    i18nKey: 'nav.calls',    Icon: Phone },
  { key: 'chats',    i18nKey: 'nav.chats',    Icon: MessageCircle },
  { key: 'settings', i18nKey: 'nav.settings', Icon: Settings },
];

export default function MobileTabBar() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settingsOpen, contactsOpen, callsOpen,
          setSettingsOpen, setContactsOpen, setCallsOpen } = useUIStore();

  const unread = useChatStore((s) =>
    s.chats.reduce((n, c) => n + (c.archivedAt ? 0 : (c.unreadCount ?? 0)), 0));

  const active: TabKey = settingsOpen ? 'settings' : contactsOpen ? 'contacts' : callsOpen ? 'calls' : 'chats';
  const activeIndex = TABS.findIndex((tb) => tb.key === active);
  const closeAll = () => { setSettingsOpen(false); setContactsOpen(false); setCallsOpen(false); };

  // ── «Liquid glass»: единая стеклянная пилюля едет за активной вкладкой и
  //    РАСТЯГИВАЕТСЯ по скорости движения (эффект воды), затем оседает. ──
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [ready, setReady] = useState(false);
  const left  = useSpring(0, { stiffness: 420, damping: 30, mass: 0.9 });
  const width = useSpring(0, { stiffness: 420, damping: 30, mass: 0.9 });
  useLayoutEffect(() => {
    const b = btnRefs.current[activeIndex];
    if (!b) return;
    if (!ready) { left.jump(b.offsetLeft); width.jump(b.offsetWidth); setReady(true); }
    else        { left.set(b.offsetLeft);  width.set(b.offsetWidth); }
  }, [activeIndex, ready, left, width]);
  useEffect(() => {
    const onResize = () => {
      const b = btnRefs.current[activeIndex];
      if (b) { left.jump(b.offsetLeft); width.jump(b.offsetWidth); }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIndex, left, width]);
  const vx     = useVelocity(left);
  const scaleX = useTransform(vx, (v) => 1 + Math.min(0.3, Math.abs(v) / 4800));    // растяжение в сторону движения
  const scaleY = useTransform(vx, (v) => 1 - Math.min(0.13, Math.abs(v) / 9500));   // лёгкое сжатие по высоте

  const onTab = (key: TabKey) => {
    haptic.selection();
    closeAll();
    if (key === 'chats')    navigate('/');
    if (key === 'contacts') setContactsOpen(true);
    if (key === 'calls')    setCallsOpen(true);
    if (key === 'settings') setSettingsOpen(true);
  };

  return (
    // Плавающий слой поверх контента: capsule по центру, над safe-area.
    <div className="lg:hidden absolute inset-x-0 bottom-0 z-40 flex justify-center
                    px-3 pb-[calc(var(--sab)+0.55rem)] pointer-events-none">
      <nav
        className="pointer-events-auto relative w-full max-w-md flex items-stretch gap-1 px-2 py-1.5
                   rounded-[28px] liquid-glass"
        role="tablist"
        aria-label={t('nav.chats')}
      >
        {/* Жидкая стеклянная пилюля — едет за активной вкладкой и растягивается «как вода» */}
        {ready && (
          <motion.span
            aria-hidden
            style={{ left, width, scaleX, scaleY }}
            className="absolute top-1.5 bottom-1.5 rounded-[20px] pointer-events-none
                       bg-[#2D6BF0]/20 ring-1 ring-white/20 backdrop-blur-md
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_18px_-6px_rgba(45,107,240,0.55)]"
          />
        )}
        {TABS.map(({ key, i18nKey, Icon }, i) => {
          const label = t(i18nKey);
          const isActive = active === key;
          const showBadge = key === 'chats' && unread > 0;
          return (
            <motion.button
              key={key}
              ref={(el) => { btnRefs.current[i] = el; }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={label}
              onClick={() => onTab(key)}
              whileTap={tap}
              transition={SPRING.snappy}
              className="relative flex-1 flex flex-col items-center justify-center gap-1 h-[50px] rounded-[22px]"
            >
              <span className="relative z-10 flex flex-col items-center gap-1">
                <motion.span
                  className="relative"
                  animate={{ scale: isActive ? 1.14 : 1, y: isActive ? -1 : 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 15 }}
                >
                  <Icon
                    size={24}
                    className={`transition-colors duration-200 ${isActive ? 'text-[#aeb4ff]' : 'text-content/55'}`}
                    fill="currentColor"
                    strokeWidth={1.6}
                  />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full
                                     bg-accent-pink text-white text-[10px] font-bold leading-[17px]
                                     text-center tabular-nums">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </motion.span>
                <span className={`text-[10px] leading-none transition-colors duration-200 ${isActive ? 'text-[#aeb4ff] font-semibold' : 'text-content/55'}`}>
                  {label}
                </span>
              </span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}
