/**
 * Safety numbers — детерминированный отпечаток пары публичных ключей.
 * Логика близка к Signal: оба публичных ключа канонически отсортированы,
 * затем SHA-512 итерационно (5200 раз), берём первые 30 байт и форматируем
 * как 12 групп по 5 цифр (60-значное число).
 *
 * Совпадение отпечатков у двух участников = вы видите одинаковые ключи.
 * Если злоумышленник подменил серверу один из ключей, отпечатки разойдутся.
 */

const ITERATIONS = 5200;

function b64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function sha512(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-512', data as BufferSource);
  return new Uint8Array(buf);
}

async function iteratedHash(pubKey: Uint8Array): Promise<Uint8Array> {
  let acc = pubKey;
  for (let i = 0; i < ITERATIONS; i++) {
    acc = await sha512(concat(acc, pubKey));
  }
  return acc.slice(0, 30); // первые 30 байт
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

// 30 байт → 12 групп по 5 десятичных цифр.
// Каждые 5 байт превращаем в число (mod 10^5), форматируем zero-pad.
function formatAsDecimal(bytes: Uint8Array): string {
  const groups: string[] = [];
  for (let i = 0; i < 30; i += 5) {
    let n = 0n;
    for (let j = 0; j < 5; j++) n = (n << 8n) | BigInt(bytes[i + j]);
    const digits = (n % 100000n).toString().padStart(5, '0');
    groups.push(digits);
  }
  return groups.join(' ');
}

/**
 * Возвращает строку вида "12345 67890 12345 67890 12345 67890" (60 цифр).
 * Одинакова для обоих участников чата.
 */
export async function computeSafetyNumber(myPubKeyB64: string, theirPubKeyB64: string): Promise<string> {
  const mine  = b64ToBytes(myPubKeyB64);
  const their = b64ToBytes(theirPubKeyB64);

  // Канонизация: меньший ключ первым (порядок не должен зависеть от того,
  // кто из юзеров «я» — иначе у собеседника будет другой отпечаток).
  const first  = compareBytes(mine, their) <= 0 ? mine  : their;
  const second = compareBytes(mine, their) <= 0 ? their : mine;

  const h1 = await iteratedHash(first);
  const h2 = await iteratedHash(second);

  return `${formatAsDecimal(h1)} ${formatAsDecimal(h2)}`;
}
