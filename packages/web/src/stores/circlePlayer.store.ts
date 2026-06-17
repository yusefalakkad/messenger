/**
 * Плавающий кружок-PiP (Telegram-style).
 *
 * Кружок играет в своём пузыре, пока тот на экране. Когда пузырь уходит из вида
 * (скролл) ИЛИ ты переходишь в другой чат — воспроизведение «подхватывает»
 * маленький плавающий кружок (FloatingCircle), смонтированный на уровне страницы.
 *
 * Источник истины — этот стор: { item, time, playing }. Активный «рендерер»
 * (пузырь ИЛИ плавающий) один за раз, переключается флагом `floating`. При
 * переходе новый рендерер выставляет currentTime = time и продолжает.
 */
import { create } from 'zustand';

export interface CircleItem {
  messageId: string;
  chatId: string;
  url: string;
  senderName: string;
  thumbnailUrl?: string;
  duration: number;
}

interface CirclePlayerState {
  item: CircleItem | null;
  /** true — играет в плавающем PiP; false — в пузыре (или ничего). */
  floating: boolean;
  playing: boolean;
  time: number;
  duration: number;

  /** Пузырь начал/продолжил играть — становится активным инлайн-рендерером. */
  playInline: (item: CircleItem) => void;
  /** Репорт времени активным рендерером. */
  report: (time: number, duration: number, playing: boolean) => void;
  /** Пузырь ушёл из вида / размонтировался во время игры → уносим в PiP. */
  detach: () => void;
  /** Пузырь снова виден → возвращаем воспроизведение в него. */
  reattach: () => void;
  setPlaying: (playing: boolean) => void;
  /** Полная остановка (крестик на PiP или конец видео). */
  stop: () => void;
}

export const useCirclePlayer = create<CirclePlayerState>((set, get) => ({
  item: null,
  floating: false,
  playing: false,
  time: 0,
  duration: 0,

  playInline: (item) => set((s) => ({
    item,
    floating: false,
    playing: true,
    // если это тот же кружок — сохраняем время, иначе с нуля
    time: s.item?.messageId === item.messageId ? s.time : 0,
    duration: item.duration || s.duration,
  })),

  report: (time, duration, playing) => set({
    time,
    duration: duration || get().duration,
    playing,
  }),

  detach: () => {
    const { item, playing } = get();
    if (!item || !playing) return;       // уносим в PiP только если реально играло
    set({ floating: true });
  },

  reattach: () => {
    if (get().floating) set({ floating: false });
  },

  setPlaying: (playing) => set({ playing }),

  stop: () => set({ item: null, floating: false, playing: false, time: 0, duration: 0 }),
}));
