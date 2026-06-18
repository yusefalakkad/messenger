import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { menu, SPRING, tapSoft } from '@/lib/motion';

/**
 * Минимальный country-picker для phone-auth. ~60 стран с приоритетом СНГ + Europe + US.
 * Хранит код в state у родителя — выдаёт через onChange(code, dialCode).
 *
 * Флаги — emoji (regional indicator letters), без картинок и зависимостей.
 */
export interface Country {
  code:     string;   // ISO 3166-1 alpha-2, например 'RU'
  dialCode: string;   // '+7'
  name:     string;   // 'Россия'
  flag:     string;   // '🇷🇺'
}

// Эмодзи-флаг из ISO кода (RU → 🇷🇺) — два regional indicator символа.
function flag(iso: string): string {
  return iso.toUpperCase().split('').map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
}

// Часто-используемые сверху, потом по алфавиту.
const COUNTRIES: Country[] = [
  // Топ — постсоветское пространство
  ['RU', '+7',   'Россия'],
  ['BY', '+375', 'Беларусь'],
  ['KZ', '+7',   'Казахстан'],
  ['UA', '+380', 'Украина'],
  ['UZ', '+998', 'Узбекистан'],
  ['KG', '+996', 'Киргизия'],
  ['TJ', '+992', 'Таджикистан'],
  ['TM', '+993', 'Туркмения'],
  ['MD', '+373', 'Молдова'],
  ['AM', '+374', 'Армения'],
  ['AZ', '+994', 'Азербайджан'],
  ['GE', '+995', 'Грузия'],
  // Европа
  ['GB', '+44',  'Великобритания'],
  ['DE', '+49',  'Германия'],
  ['FR', '+33',  'Франция'],
  ['IT', '+39',  'Италия'],
  ['ES', '+34',  'Испания'],
  ['PL', '+48',  'Польша'],
  ['NL', '+31',  'Нидерланды'],
  ['BE', '+32',  'Бельгия'],
  ['CH', '+41',  'Швейцария'],
  ['AT', '+43',  'Австрия'],
  ['SE', '+46',  'Швеция'],
  ['NO', '+47',  'Норвегия'],
  ['FI', '+358', 'Финляндия'],
  ['DK', '+45',  'Дания'],
  ['IE', '+353', 'Ирландия'],
  ['PT', '+351', 'Португалия'],
  ['CZ', '+420', 'Чехия'],
  ['SK', '+421', 'Словакия'],
  ['HU', '+36',  'Венгрия'],
  ['RO', '+40',  'Румыния'],
  ['BG', '+359', 'Болгария'],
  ['GR', '+30',  'Греция'],
  ['HR', '+385', 'Хорватия'],
  ['RS', '+381', 'Сербия'],
  ['EE', '+372', 'Эстония'],
  ['LV', '+371', 'Латвия'],
  ['LT', '+370', 'Литва'],
  ['IS', '+354', 'Исландия'],
  // Америки
  ['US', '+1',   'США'],
  ['CA', '+1',   'Канада'],
  ['MX', '+52',  'Мексика'],
  ['BR', '+55',  'Бразилия'],
  ['AR', '+54',  'Аргентина'],
  ['CL', '+56',  'Чили'],
  ['CO', '+57',  'Колумбия'],
  ['PE', '+51',  'Перу'],
  // Азия
  ['CN', '+86',  'Китай'],
  ['JP', '+81',  'Япония'],
  ['KR', '+82',  'Южная Корея'],
  ['IN', '+91',  'Индия'],
  ['ID', '+62',  'Индонезия'],
  ['TH', '+66',  'Таиланд'],
  ['VN', '+84',  'Вьетнам'],
  ['MY', '+60',  'Малайзия'],
  ['SG', '+65',  'Сингапур'],
  ['PH', '+63',  'Филиппины'],
  ['HK', '+852', 'Гонконг'],
  ['TW', '+886', 'Тайвань'],
  // Ближний Восток
  ['TR', '+90',  'Турция'],
  ['SY', '+963', 'Сирия'],
  ['JO', '+962', 'Иордания'],
  ['AE', '+971', 'ОАЭ'],
  ['SA', '+966', 'Саудовская Аравия'],
  ['QA', '+974', 'Катар'],
  ['EG', '+20',  'Египет'],
  // Океания
  ['AU', '+61',  'Австралия'],
  ['NZ', '+64',  'Новая Зеландия'],
  // Африка
  ['ZA', '+27',  'ЮАР'],
  ['NG', '+234', 'Нигерия'],
  ['KE', '+254', 'Кения'],
  ['MA', '+212', 'Марокко'],
].map(([code, dialCode, name]) => ({ code, dialCode, name, flag: flag(code) }));

export const DEFAULT_COUNTRY: Country = COUNTRIES[0]; // RU
export { COUNTRIES };

/**
 * Умный парс пользовательского ввода: возвращает страну (если автодетект сработал)
 * и «локальную» часть номера без dial-кода.
 *
 *   '+7 999 ...'    → country=RU, local='999...'
 *   '+44 7700 ...'  → country=GB, local='7700...'
 *   '8 999 ...'     → country=RU, local='999...' (домашний формат)
 *   '999 123-45-67' → keep currentCountry, local='9991234567'
 */
/** Арабско-индийские (٠-٩) и восточные/персидские (۰-۹) цифры → латинские 0-9.
 *  Иначе арабская клавиатура вводит цифры, которые \D вырезает → ввод не работает. */
export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/** Латинские 0-9 → арабско-индийские ٠-٩ (для отображения при арабском языке). */
export function toArabicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

export function parsePhoneInput(raw: string, currentCountry: Country): { local: string; country: Country } {
  const trimmed = toLatinDigits(raw.trim());
  const digits  = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+') && digits.length > 0) {
    // Сортируем по длине dial-кода (по убыванию) — `+1` vs `+1242` (Бахамы).
    const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sorted) {
      const cd = c.dialCode.replace(/\D/g, '');
      if (digits.startsWith(cd)) {
        return { country: c, local: digits.slice(cd.length) };
      }
    }
    return { country: currentCountry, local: digits };
  }

  // RU + Казахстан: `8XXXXXXXXXX` ─ домашняя замена `+7`.
  if (currentCountry.dialCode === '+7' && digits.length === 11 && digits.startsWith('8')) {
    return { country: currentCountry, local: digits.slice(1) };
  }

  return { country: currentCountry, local: digits };
}

interface Props {
  value: Country;
  onChange: (c: Country) => void;
}

export default function CountryPicker({ value, onChange }: Props) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Закрытие по клику снаружи
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Авто-фокус на поиск при открытии
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = !search.trim()
    ? COUNTRIES
    : COUNTRIES.filter((c) => {
        const q = search.toLowerCase().trim();
        return c.name.toLowerCase().includes(q)
            || c.code.toLowerCase().includes(q)
            || c.dialCode.includes(q);
      });

  return (
    <div ref={wrapRef} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileTap={tapSoft}
        transition={SPRING.snappy}
        className="flex items-center gap-1.5 h-10 px-2 -ml-1 rounded-md text-content/85 hover:bg-content/[0.06]
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 transition-colors"
        aria-label="Выбрать страну"
      >
        <span className="text-lg leading-none">{value.flag}</span>
        <span className="font-medium text-[14px] tabular-nums">{value.dialCode}</span>
        <ChevronDown size={14} className={clsx('text-content/45 transition-transform duration-200', open && 'rotate-180')} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={menu}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: 'top left' }}
            className="absolute z-dropdown top-full left-0 mt-2 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl
                       bg-dark-surface border border-dark-border shadow-e3 overflow-hidden"
          >
            <div className="p-2 border-b border-dark-border">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content/40" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск страны или кода"
                  className="w-full h-9 pl-9 pr-3 rounded-md bg-content/[0.04] border border-dark-border text-content text-[13px]
                             placeholder:text-content/35 outline-none transition focus:bg-content/[0.06]
                             focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto py-1 overscroll-contain">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-content/40 text-[13px]">Ничего не найдено</div>
              ) : (
                filtered.map((c) => {
                  const selected = c.code === value.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        onChange(c);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={clsx(
                        'group w-full flex items-center gap-3 px-3 h-10 text-left transition-colors',
                        'hover:bg-content/[0.06] active:bg-content/[0.09]',
                        'focus-visible:outline-none focus-visible:bg-content/[0.06]',
                        selected && 'bg-primary-500/[0.12]',
                      )}
                    >
                      <span className="text-base leading-none flex-shrink-0">{c.flag}</span>
                      <span className={clsx(
                        'flex-1 truncate text-[14px]',
                        selected ? 'text-content font-medium' : 'text-content/85',
                      )}>{c.name}</span>
                      <span className={clsx(
                        'text-[13px] tabular-nums flex-shrink-0',
                        selected ? 'text-primary-600 dark:text-primary-300' : 'text-content/45',
                      )}>{c.dialCode}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
