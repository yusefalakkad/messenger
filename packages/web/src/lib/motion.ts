/**
 * Единая система анимаций. Один источник истины для всех framer-motion переходов,
 * чтобы движение по всему приложению было согласованным и «дорогим».
 *
 * Принципы:
 *  • Spring-физика для интерактива (кнопки, оверлеи) — живое, не линейное.
 *  • Короткие выразительные easing-кривые для входов/выходов.
 *  • Reduced-motion уважается на уровне CSS (@media prefers-reduced-motion).
 */
import type { Transition, Variants } from 'framer-motion';

// ─── Easing-кривые ────────────────────────────────────────────────────────────
export const EASE = {
  /** Основная — мягкий заход, как у iOS. */
  soft:   [0.32, 0.72, 0, 1] as [number, number, number, number],
  /** Энергичный выход. */
  out:    [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** Лёгкий overshoot для «pop». */
  spring: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
};

// ─── Spring-пресеты ───────────────────────────────────────────────────────────
export const SPRING = {
  /** Отзывчивый клик/нажатие. */
  snappy:  { type: 'spring', stiffness: 500, damping: 32, mass: 0.8 } as Transition,
  /** Плавный оверлей/панель. */
  smooth:  { type: 'spring', stiffness: 320, damping: 34 } as Transition,
  /** Мягкий «дышащий» переход. */
  gentle:  { type: 'spring', stiffness: 220, damping: 28 } as Transition,
  /** Боковая панель (drawer). */
  panel:   { type: 'spring', stiffness: 300, damping: 30 } as Transition,
};

// ─── Готовые варианты ─────────────────────────────────────────────────────────

/** Появление снизу с лёгким масштабом — для пузырей, карточек. */
export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 10, scale: 0.98 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.28, ease: EASE.out } },
  exit:    { opacity: 0, y: 6,  scale: 0.98, transition: { duration: 0.18, ease: EASE.soft } },
};

/** Масштабный поп для модалок/диалогов. */
export const popIn: Variants = {
  hidden:  { opacity: 0, scale: 0.94, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: SPRING.smooth },
  exit:    { opacity: 0, scale: 0.96, y: 4, transition: { duration: 0.16, ease: EASE.soft } },
};

/** Затемнение-подложка оверлея. */
export const backdrop: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};

/** Выпадающее меню/поповер от точки привязки. */
export const menu: Variants = {
  hidden:  { opacity: 0, scale: 0.95, y: -6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.18, ease: EASE.out } },
  exit:    { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } },
};

/** Боковая панель справа (профиль). */
export const drawerRight: Variants = {
  hidden:  { x: '100%' },
  visible: { x: 0, transition: SPRING.panel },
  exit:    { x: '100%', transition: { duration: 0.22, ease: EASE.soft } },
};

/** Микро-нажатие для кнопок (whileTap). */
export const tap = { scale: 0.96 };
export const tapSoft = { scale: 0.97 };

/** Stagger для списков (родитель). */
export const listParent: Variants = {
  visible: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};
export const listChild: Variants = {
  hidden:  { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE.out } },
};
