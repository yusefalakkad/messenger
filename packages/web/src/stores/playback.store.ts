/**
 * Глобальное воспроизведение голосовых сообщений (Telegram-style).
 *
 * КЛЮЧЕВОЕ: единственный <audio> живёт на уровне МОДУЛЯ (вне React-дерева),
 * поэтому воспроизведение НЕ обрывается при переходе между чатами/размонтировании
 * пузыря. Верхняя плашка NowPlayingBar и сам пузырёк VoiceMessage — лишь
 * «контроллеры/индикаторы» этого стора.
 *
 * Скорость (rate) — глобальная, одна на всё (как в Telegram).
 */
import { create } from 'zustand';
import { useCirclePlayer } from './circlePlayer.store';

export interface PlaybackItem {
  messageId: string;
  chatId: string;
  url: string;
  senderName: string;
  duration: number; // фолбэк, пока не загрузились метаданные
}

interface PlaybackState {
  current: PlaybackItem | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;

  /** Запустить новый трек ИЛИ тогглить, если это тот же messageId. */
  play: (item: PlaybackItem) => void;
  toggle: () => void;
  pause: () => void;
  /** Перемотка по доле 0..1. */
  seekRatio: (r: number) => void;
  setRate: (r: number) => void;
  /** Полностью остановить и скрыть плашку. */
  stop: () => void;
}

export const RATES = [1, 1.5, 2] as const;

let audio: HTMLAudioElement | null = null;
let raf = 0;

export const usePlaybackStore = create<PlaybackState>((set, get) => {
  // Плавный прогресс: timeupdate срабатывает ~4 раза/сек, для waveform мало.
  const startRaf = () => {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (audio && !audio.paused) {
        set({ currentTime: audio.currentTime });
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
  };

  const ensureAudio = (): HTMLAudioElement => {
    if (audio) return audio;
    const a = new Audio();
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => {
      if (a.duration && Number.isFinite(a.duration)) set({ duration: a.duration });
    });
    a.addEventListener('play',  () => { set({ playing: true }); startRaf(); });
    a.addEventListener('pause', () => { set({ playing: false }); cancelAnimationFrame(raf); });
    a.addEventListener('ended', () => {
      cancelAnimationFrame(raf);
      set({ playing: false, currentTime: 0 });
    });
    a.addEventListener('error', () => { set({ playing: false }); cancelAnimationFrame(raf); });
    audio = a;
    return a;
  };

  return {
    current: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    rate: 1,

    play: (item) => {
      const a = ensureAudio();
      const { current, rate } = get();
      if (current?.messageId === item.messageId) {
        // тот же трек → пауза/продолжить
        if (a.paused) { useCirclePlayer.getState().stop(); a.play().catch(() => {}); }
        else a.pause();
        return;
      }
      // «один звук за раз»: запуск голосового глушит играющий кружок-PiP
      useCirclePlayer.getState().stop();
      a.src = item.url;
      a.playbackRate = rate;
      set({ current: item, currentTime: 0, duration: item.duration || 0, playing: false });
      a.play().catch(() => {});
    },

    toggle: () => {
      const a = audio;
      if (!a || !get().current) return;
      if (a.paused) { useCirclePlayer.getState().stop(); a.play().catch(() => {}); }
      else a.pause();
    },

    pause: () => { audio?.pause(); },

    seekRatio: (r) => {
      const a = audio;
      const { duration } = get();
      if (!a || duration <= 0) return;
      const t = Math.min(duration, Math.max(0, r * duration));
      a.currentTime = t;
      set({ currentTime: t });
    },

    setRate: (rate) => {
      if (audio) audio.playbackRate = rate;
      set({ rate });
    },

    stop: () => {
      cancelAnimationFrame(raf);
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      set({ current: null, playing: false, currentTime: 0, duration: 0 });
    },
  };
});
