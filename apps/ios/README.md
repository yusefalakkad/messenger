# Dakka — нативный iOS-клиент

Swift / SwiftUI. Без Capacitor, без WebView. Самостоятельное iOS-приложение, ходит на `https://akkdmsg.online/api`.

## Структура

```
apps/ios/
├── project.yml                    ← XcodeGen-спека, генерится Dakka.xcodeproj
├── README.md
└── dakka/
    ├── DakkaApp.swift              ← @main
    ├── Info.plist
    ├── Dakka.entitlements          ← APNs aps-environment
    ├── Assets.xcassets/            ← AppIcon, AccentColor, BrandBackground
    ├── Config/AppConfig.swift      ← apiBaseURL, socketBaseURL
    ├── Core/
    │   ├── Theme/                  ← бренд-цвета, градиенты, типографика
    │   ├── Networking/             ← APIClient (async/await), SocketClient
    │   ├── Auth/                   ← AuthStore, KeychainStore, AuthService
    │   ├── Crypto/                 ← E2E через CryptoKit (P-256 + AES-GCM)
    │   ├── Media/                  ← AudioRecorder, AudioPlayer, CircleRecorder, MediaService
    │   ├── Push/                   ← PushManager, AppDelegate
    │   ├── Call/                   ← CallManager, WebRTCManager, CallStore, CallTypes
    │   └── Models/                 ← User, Chat, Message, DTO
    └── Features/
        ├── Common/                 ← Avatar, BrandButton, BrandTextField, BrandChip, AmbientBackground
        ├── Auth/                   ← AuthView (табы), LoginView (+2FA), RegisterView
        ├── ChatList/               ← ChatListView + Row + ViewModel
        ├── Chat/                   ← ChatView, MessageBubble, MessageInput,
        │                              VoicePlayer, CirclePlayer, CircleRecorder,
        │                              ImagePicker, ForwardSheet, ReactionPicker, InputBars
        ├── NewChat/                ← NewChatView (direct), NewGroupView (групп)
        ├── Profile/                ← ProfilePanel
        ├── Settings/               ← SettingsView, EditProfileView
        ├── Call/                   ← ActiveCallView, IncomingCallView, VideoView
        └── Root/                   ← RootView (auth ↔ chats, оверлей звонка)
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

Появится `Dakka.xcodeproj`. Открыть:

```bash
xed Dakka.xcodeproj
```

При первом открытии Xcode зарезолвит SPM-зависимости (SocketIO ~10MB, WebRTC ~80MB) — это 2-3 минуты, в дальнейшем кэшируется.

### 3. Подписать и запустить

В Xcode:
1. Выбрать таргет **Dakka** → вкладка **Signing & Capabilities** → выставить **Team** (твой Apple ID)
2. Сверху выбрать устройство: симулятор или подключённый iPhone
3. ⌘R или ▶

⚠️ Камера / микрофон не работают в симуляторе (нет железа). Аудио-звонки можно пробовать между двумя симуляторами, видео — только на реальном устройстве.

## Что работает

- 🎨 **Дизайн**: один-в-один с веб-версией (violet→pink→orange brand-градиент, тёмно-фиолетовый фон, ambient-засветки, glass cards)
- 🔐 **Auth**: login / register / 2FA, JWT в Keychain переживает перезапуск
- 🔒 **E2E-шифрование**: CryptoKit P-256 + AES-256-GCM, байт-в-байт совместимо с веб-клиентом
- 📡 **Real-time**: socket.io-client-swift, авто-коннект при логине
- 💬 **Чат**: текст, голос (с waveform), фото, видео-кружки
- 🎤 **Голос**: запись с живым waveform → inline-плеер с прогрессом
- 📷 **Фото**: PhotosPicker → авто-ресайз/сжатие → AsyncImage в пузырьке
- ⭕ **Кружки**: full-screen camera → лупящийся круглый плеер
- 😂 **Реакции, ответы, пересылка, редактирование, удаление**
- 📞 **Звонки** (audio/video через WebRTC + STUN)
- 🔔 **Push** (APNs, deep-link при тапе)
- 👥 **Группы**: создание + список участников в ProfilePanel
- ⚙️ **Settings**: профиль, аватар, выход
- 👤 **ProfilePanel**: тап на header чата → инфо собеседника

## Что НЕ работает (отдельные сессии)

- ❌ **CallKit** — системный UI звонка, приём при killed-app. Нужен VoIP APNs cert
- ❌ **TURN сервер** — без него за симметричными NAT'ами звонок не установится (сейчас только STUN от Google)
- ❌ **Иконка приложения** — `Assets.xcassets/AppIcon.appiconset/` пустой, положи 1024×1024 PNG
- ❌ **2FA setup UI** — текущий экран только для ввода кода при логине; нет включения 2FA в Settings
- ❌ **Поиск по сообщениям**, mute chat, clear history

## Конфигурация

API-сервер по умолчанию `https://akkdmsg.online/api`. Переопределить через `Info.plist`:

```xml
<key>API_URL</key><string>https://your-domain/api</string>
<key>SOCKET_URL</key><string>https://your-domain</string>
```

## Команды

```bash
# Регенерировать Dakka.xcodeproj после правок project.yml
xcodegen

# Открыть в Xcode
xed Dakka.xcodeproj

# Сборка без Xcode
xcodebuild -project Dakka.xcodeproj -scheme Dakka -destination 'generic/platform=iOS' build
```

## Минимальная версия iOS

**iOS 16.0** — для `NavigationStack`, `matchedGeometryEffect`, async/await в SwiftUI, нативного `PhotosPicker`.
