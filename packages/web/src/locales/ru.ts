// Русский словарь. Источник истины для ключей; en.ts должен повторять структуру.
// Полная замена строк по приложению — инкрементально; пока покрыты ключевые
// экраны (auth, настройки, общие кнопки, чат-инпут).
export const ru = {
  common: {
    save: 'Сохранить', cancel: 'Отмена', delete: 'Удалить', send: 'Отправить',
    back: 'Назад', close: 'Закрыть', search: 'Поиск', loading: 'Загрузка…',
    confirm: 'Подтвердить', retry: 'Повторить',
  },
  settings: {
    title: 'Настройки', appearance: 'Внешний вид',
    themeDark: 'Тёмная', themeLight: 'Светлая', themeAuto: 'Авто',
    language: 'Язык', profile: 'Профиль', security: 'Безопасность', privacy: 'Приватность',
  },
  auth: {
    tagline: 'Общение, которое чувствуешь',
    e2eBadge: 'E2E-шифрование по умолчанию',
    enterPhone: 'Введите ваш номер',
    phoneHint: 'Мы отправим одноразовый код через Telegram.',
    phoneLabel: 'Номер телефона',
    sendCode: 'Отправить код',
    enterCode: 'Введите код',
    codeSentTo: 'Мы отправили 6-значный код на',
    changeNumber: 'Сменить номер',
    terms: 'Продолжая, вы соглашаетесь с условиями использования',
  },
  chat: {
    messagePlaceholder: 'Сообщение…',
    searchChats: 'Поиск чатов…',
    online: 'в сети', offline: 'не в сети',
    archive: 'Архив', saved: 'Избранное',
    downloadApp: 'Скачать приложение',
    newChat: 'Новый чат', newGroup: 'Новая группа', newChannel: 'Новый канал',
    settings: 'Настройки', logout: 'Выйти',
  },
};

export type Dict = typeof ru;
