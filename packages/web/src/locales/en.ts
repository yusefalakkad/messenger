import type { Dict } from './ru';

// English dictionary — mirrors ru.ts structure.
export const en: Dict = {
  common: {
    save: 'Save', cancel: 'Cancel', delete: 'Delete', send: 'Send',
    back: 'Back', close: 'Close', search: 'Search', loading: 'Loading…',
    confirm: 'Confirm', retry: 'Retry',
  },
  settings: {
    title: 'Settings', appearance: 'Appearance',
    themeDark: 'Dark', themeLight: 'Light', themeAuto: 'Auto',
    language: 'Language', profile: 'Profile', security: 'Security', privacy: 'Privacy',
  },
  auth: {
    tagline: 'Messaging you can feel',
    e2eBadge: 'Privacy by default',
    enterPhone: 'Enter your number',
    phoneHint: 'We will send a one-time code via Telegram.',
    phoneLabel: 'Phone number',
    sendCode: 'Send code',
    enterCode: 'Enter code',
    codeSentTo: 'We sent a 6-digit code to',
    changeNumber: 'Change number',
    terms: 'By continuing, you agree to the terms of service',
  },
  chat: {
    messagePlaceholder: 'Message…',
    searchChats: 'Search chats…',
    online: 'online', offline: 'offline',
    archive: 'Archive', saved: 'Saved Messages',
    downloadApp: 'Download app',
    newChat: 'New chat', newGroup: 'New group', newChannel: 'New channel',
    settings: 'Settings', logout: 'Log out',
  },
};
