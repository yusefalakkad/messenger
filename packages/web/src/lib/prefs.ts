/**
 * Локальные настройки уведомлений (per-device, без сервера).
 * Хранятся в localStorage под ключом 'prefs:notifications'.
 *  • sound    — играть ли звук при входящем сообщении
 *  • previews — показывать ли текст сообщения в системном уведомлении
 */

export interface NotifPrefs {
  sound: boolean;
  previews: boolean;
}

const STORAGE_KEY = 'prefs:notifications';

const DEFAULT_PREFS: NotifPrefs = {
  sound: true,
  previews: true,
};

/** Читает настройки уведомлений; при ошибке/отсутствии — дефолты. */
export function getNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return {
      sound:    typeof parsed.sound    === 'boolean' ? parsed.sound    : DEFAULT_PREFS.sound,
      previews: typeof parsed.previews === 'boolean' ? parsed.previews : DEFAULT_PREFS.previews,
    };
  } catch {
    // localStorage недоступен (private mode / SSR) или битый JSON — дефолты
    return { ...DEFAULT_PREFS };
  }
}

/** Частичное обновление настроек; возвращает итоговое состояние. */
export function setNotifPrefs(partial: Partial<NotifPrefs>): NotifPrefs {
  const next = { ...getNotifPrefs(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // запись не удалась — не критично, настройки проживут до перезагрузки
  }
  return next;
}
