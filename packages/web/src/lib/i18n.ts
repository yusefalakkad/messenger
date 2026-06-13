/**
 * Интернационализация (i18next + react-i18next).
 *
 * Язык: ru | en. Хранится в localStorage('lang'); по умолчанию — системный.
 * Использование в компонентах: const { t } = useTranslation(); t('settings.title').
 *
 * Покрытие строк наращивается инкрементально (ключевые экраны уже переведены).
 * Непереведённые строки остаются как есть в коде (на русском) до миграции.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ru } from '@/locales/ru';
import { en } from '@/locales/en';

const STORAGE_KEY = 'lang';
export type Lang = 'ru' | 'en';

export function getStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'ru' || v === 'en') return v;
  } catch { /* инкогнито */ }
  const sys = typeof navigator !== 'undefined' ? navigator.language : 'ru';
  return sys.startsWith('en') ? 'en' : 'ru';
}

const initialLang = getStoredLang();
i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: initialLang,
  fallbackLng: 'ru',
  interpolation: { escapeValue: false }, // React сам экранирует
});

// <html lang> — для screen reader'ов и корректной типографики/переносов.
function applyHtmlLang(lng: Lang): void {
  try { document.documentElement.setAttribute('lang', lng); } catch { /* SSR */ }
}
applyHtmlLang(initialLang);

export function setLang(lng: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, lng); } catch { /* */ }
  void i18n.changeLanguage(lng);
  applyHtmlLang(lng);
}

export default i18n;
