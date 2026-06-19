import { create } from 'zustand';

/**
 * Глобальные UI-оверлеи, которые открываются из РАЗНЫХ мест (сайдбар + мобильный
 * таб-бар). Держим в одном сторе, чтобы не дублировать модалки и не прокидывать
 * колбэки через дерево. Рендерятся один раз на уровне ChatPage.
 */
interface UIState {
  settingsOpen: boolean;
  contactsOpen: boolean; // панель поиска людей — вкладка «Контакты»
  callsOpen: boolean;    // панель истории звонков — вкладка «Звонки»
  archiveOpen: boolean;  // диалог архивных чатов (откр. из рейла и мобильной строки)
  setSettingsOpen: (open: boolean) => void;
  setContactsOpen: (open: boolean) => void;
  setCallsOpen: (open: boolean) => void;
  setArchiveOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  contactsOpen: false,
  callsOpen: false,
  archiveOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setContactsOpen: (contactsOpen) => set({ contactsOpen }),
  setCallsOpen: (callsOpen) => set({ callsOpen }),
  setArchiveOpen: (archiveOpen) => set({ archiveOpen }),
}));
