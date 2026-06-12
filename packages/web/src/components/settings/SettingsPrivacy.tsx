import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { getNotifPrefs, setNotifPrefs } from '@/lib/prefs';

/**
 * Секция «Конфиденциальность» — серверные настройки приватности
 * (GET/PATCH /users/me/privacy) + локальные настройки уведомлений (lib/prefs).
 * Серверные тогглы — оптимистично, с откатом при ошибке.
 */

// Мини-переключатель: трек 44×24, кружок 20px. Вся строка кликабельна (hit ≥44).
function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-gradient-to-r from-[#8a52ff] via-[#d04df0] to-[#ff5a8f]' : 'bg-white/15',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

function ToggleRow({
  label, hint, checked, onChange, disabled,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      className="flex items-center gap-3 px-1 min-h-[44px] py-1.5 cursor-pointer select-none"
      onClick={() => { if (!disabled) onChange(!checked); }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[15px]">{label}</div>
        {hint && <div className="text-[12px] text-white/40 mt-0.5">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

type Privacy = { lastSeenVisibility: 'everyone' | 'nobody'; readReceiptsEnabled: boolean };

export default function SettingsPrivacy() {
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [notif, setNotif] = useState(() => getNotifPrefs());

  useEffect(() => {
    api.get('/users/me/privacy')
      .then(({ data }) => setPrivacy(data.data))
      .catch(() => toast.error('Не удалось загрузить настройки приватности'));
  }, []);

  // Оптимистичное обновление с откатом при ошибке
  const patchPrivacy = (partial: Partial<Privacy>) => {
    setPrivacy((prev) => (prev ? { ...prev, ...partial } : prev));
    api.patch('/users/me/privacy', partial)
      .then(({ data }) => setPrivacy(data.data))
      .catch(() => {
        api.get('/users/me/privacy').then(({ data }) => setPrivacy(data.data)).catch(() => {});
        toast.error('Не удалось сохранить настройку');
      });
  };

  const updateNotif = (partial: Partial<typeof notif>) => {
    setNotif(setNotifPrefs(partial));
  };

  return (
    <div>
      <div className="mb-2 px-1">
        <span className="text-[12px] uppercase tracking-wider font-semibold text-white/55">Конфиденциальность</span>
      </div>

      <ToggleRow
        label="Показывать, когда я в сети"
        hint="Если выключено — для всех вы офлайн"
        checked={privacy?.lastSeenVisibility === 'everyone'}
        disabled={privacy === null}
        onChange={(v) => patchPrivacy({ lastSeenVisibility: v ? 'everyone' : 'nobody' })}
      />
      <ToggleRow
        label="Отчёты о прочтении"
        hint="Собеседники видят, что вы прочитали сообщение"
        checked={privacy?.readReceiptsEnabled ?? true}
        disabled={privacy === null}
        onChange={(v) => patchPrivacy({ readReceiptsEnabled: v })}
      />

      <div className="mt-4 mb-2 px-1">
        <span className="text-[12px] uppercase tracking-wider font-semibold text-white/55">Уведомления</span>
      </div>

      <ToggleRow
        label="Звук"
        hint="Проигрывать звук при новом сообщении"
        checked={notif.sound}
        onChange={(v) => updateNotif({ sound: v })}
      />
      <ToggleRow
        label="Текст сообщения в уведомлении"
        hint="Если выключено — без текста сообщения"
        checked={notif.previews}
        onChange={(v) => updateNotif({ previews: v })}
      />
    </div>
  );
}
