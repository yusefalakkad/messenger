# messen — нативный iOS-клиент

Swift / SwiftUI. Без Capacitor, без WebView. Самостоятельное iOS-приложение, ходит на тот же `https://akkdmsg.online/api`.

## Структура

```
apps/ios/
├── project.yml                  ← XcodeGen-спека, из которой генерится .xcodeproj
├── README.md
└── messen/
    ├── messenApp.swift          ← @main, корневая Scene
    ├── Info.plist
    ├── Assets.xcassets/         ← AppIcon, AccentColor, BrandBackground
    ├── Config/
    │   └── AppConfig.swift      ← apiBaseURL, socketBaseURL
    ├── Core/
    │   ├── Theme/               ← цвета бренда, градиенты, типографика
    │   ├── Networking/          ← APIClient (async/await), APIError
    │   ├── Auth/                ← AuthStore, KeychainStore, AuthService
    │   └── Models/              ← User, Chat, Message, DTO
    └── Features/
        ├── Common/              ← Avatar, BrandButton, BrandTextField, BrandChip
        ├── Auth/                ← AuthView (табы), LoginView, RegisterView
        ├── ChatList/            ← ChatListView, ChatListRow, VM
        └── Root/                ← RootView (auth → chat list)
```

## Первый запуск

### 1. Установить инструменты (один раз)

```bash
brew install xcodegen
```

### 2. Сгенерировать Xcode-проект

```bash
cd apps/ios
xcodegen
```

Появится `messen.xcodeproj`. Открыть:

```bash
xed messen.xcodeproj    # или: open messen.xcodeproj
```

### 3. Подписать и запустить

В Xcode:
1. Выбрать таргет **messen** → вкладка **Signing & Capabilities** → выставить **Team** (твой Apple ID)
2. Сверху выбрать устройство: симулятор или подключённый iPhone
3. ⌘R или ▶

## Что уже работает

- 🎨 **Дизайн**: дизайн один-в-один с веб-версией (брендовый violet→pink→orange градиент, глубокий фиолетово-чёрный фон, ambient-засветки, стеклянные карточки)
- 🔐 **Auth**: login / register / 2FA — реальные запросы к `https://akkdmsg.online/api/auth/*`
- 💾 **Сессия**: JWT и user сохраняются в Keychain — переживают перезапуск приложения
- 💬 **Лист чатов**: загрузка с сервера, поиск, pull-to-refresh, пустое состояние, ошибки
- 🎭 **Тёмная тема**: принудительная, страница навигации стилизована

## Что NOT работает (TODO в следующих сессиях)

- ❌ **E2E-шифрование**. Нужно интегрировать [swift-sodium](https://github.com/jedisct1/swift-sodium) и сгенерировать пару ключей при регистрации
- ❌ **WebSocket**. На iOS подходит [Starscream](https://github.com/daltoniam/Starscream) или Socket.IO Swift Client. Нужен для real-time сообщений и статуса typing
- ❌ **Экран чата**. Сейчас только заглушка
- ❌ **Отправка сообщений**, реакции, ответы, голос, видео-кружки
- ❌ **Звонки** (WebRTC). [google-webrtc](https://cocoapods.org/pods/GoogleWebRTC) или LiveKit-SDK
- ❌ **Push-уведомления** (APNs). См. `docs/IOS_BUILD.md` про APNs-сертификат — структура серверная одна и та же, изменится только клиентская регистрация в `AuthStore`
- ❌ **Иконка приложения**. В `Assets.xcassets/AppIcon.appiconset/` пустой набор — положи 1024×1024 PNG

## Конфигурация

API-сервер по умолчанию `https://akkdmsg.online/api`. Переопределить через `Info.plist`:

```xml
<key>API_URL</key><string>https://your-domain/api</string>
<key>SOCKET_URL</key><string>https://your-domain</string>
```

## Команды

```bash
# Регенерировать .xcodeproj после правок project.yml
xcodegen

# Открыть в Xcode
xed messen.xcodeproj

# Запустить тесты (когда будут)
xcodebuild -project messen.xcodeproj -scheme messen test
```

## Минимальная версия iOS

**iOS 16.0** — для `NavigationStack`, `.gradient`, async/await в SwiftUI. Если нужна поддержка iOS 15, заменить `NavigationStack` на `NavigationView` и убрать `scrollDismissesKeyboard`.
