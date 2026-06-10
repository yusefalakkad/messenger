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

// ── Рингтон для входящего звонка ─────────────────────────────────────────────
//
// Синтезируем «классический» паттерн: 1.2 сек звон → 0.8 сек тишина → повтор.
// Через Web Audio API — без файлов. Один интервал на весь процесс,
// stopRing() гасит и осциллятор, и интервал. Idempotent.

let ringIntervalId: ReturnType<typeof setInterval> | null = null;
let ringActive = false;

function playRingPulse(): void {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') void ac.resume();

    const oscA = ac.createOscillator();
    const oscB = ac.createOscillator();
    const gain = ac.createGain();

    // Двухтоновый «телефонный» звон 440 + 480 Гц (стандартный US ring).
    oscA.type = 'sine';
    oscB.type = 'sine';
    oscA.frequency.setValueAtTime(440, ac.currentTime);
    oscB.frequency.setValueAtTime(480, ac.currentTime);

    // Огибающая: быстрая атака, плавный спад, общая длительность ~1.2с.
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ac.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0.10, ac.currentTime + 1.0);
    gain.gain.linearRampToValueAtTime(0,    ac.currentTime + 1.2);

    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(ac.destination);

    oscA.start(ac.currentTime);
    oscB.start(ac.currentTime);
    oscA.stop(ac.currentTime + 1.2);
    oscB.stop(ac.currentTime + 1.2);
  } catch { /* Web Audio недоступен */ }
}

export function startRing(): void {
  if (ringActive) return;
  ringActive = true;
  // Сразу первый импульс, потом каждые 2с.
  playRingPulse();
  ringIntervalId = setInterval(playRingPulse, 2000);
}

export function stopRing(): void {
  ringActive = false;
  if (ringIntervalId) { clearInterval(ringIntervalId); ringIntervalId = null; }
}
