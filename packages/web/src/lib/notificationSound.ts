/**
 * Короткий звук уведомления — синтезируется через Web Audio API (без файлов).
 * Мягкий "попс" как в Telegram.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function playNotificationSound(): void {
  try {
    const ac = getCtx();
    // Два осциллятора — основной тон + приглушённый призвук
    const osc1 = ac.createOscillator();
    const osc2 = ac.createOscillator();
    const gain = ac.createGain();

    osc1.frequency.setValueAtTime(880, ac.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(440, ac.currentTime + 0.12);
    osc2.frequency.setValueAtTime(1320, ac.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(660, ac.currentTime + 0.08);

    osc1.type = 'sine';
    osc2.type = 'sine';

    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ac.destination);

    osc1.start(ac.currentTime);
    osc2.start(ac.currentTime);
    osc1.stop(ac.currentTime + 0.25);
    osc2.stop(ac.currentTime + 0.25);
  } catch {
    // Web Audio API недоступен
  }
}
