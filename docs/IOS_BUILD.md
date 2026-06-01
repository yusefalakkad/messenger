# Сборка iOS-приложения (Capacitor)

Веб-приложение из `packages/web` упаковано в нативный iOS-шелл через **Capacitor 6**. Один общий React-код, две сборки: веб (akkdmsg.online) и iOS (App Store / TestFlight).

## Требования (один раз)

- macOS с актуальной **Xcode 15+** (из App Store)
- **Xcode Command Line Tools**: `xcode-select --install`
- **CocoaPods**: `sudo gem install cocoapods` или `brew install cocoapods`
- **Apple Developer Account** (для подписи и публикации; для симулятора достаточно бесплатного Apple ID)
- Node 18+ и установленные зависимости проекта (`npm install` в корне)

## Первая инициализация iOS-проекта

Выполнить **один раз** в `packages/web`:

```bash
cd packages/web
npm run build           # собирает dist/
npm run ios:init        # создаёт папку ios/ с нативным проектом
npm run ios:sync        # build + копирование dist/ внутрь ios + установка CocoaPods
```

После этого в `packages/web/ios/App/` появится Xcode-проект.

## Открытие в Xcode и запуск

```bash
npm run ios:open
```

В Xcode:
1. **Signing & Capabilities** → выбери свою Team (Apple ID)
2. Подключи iPhone по USB ИЛИ выбери симулятор в верхнем баре
3. Жми ▶ (Cmd+R)

Если используешь свой iPhone впервые — на нём нужно: Settings → General → VPN & Device Management → доверять профилю разработчика.

## Цикл разработки

Меняешь TypeScript/React код → пересобираешь web → синхронизируешь в iOS:

```bash
npm run ios:sync        # build + cap sync ios
# затем в Xcode жми ▶
```

Или в один шаг:

```bash
npm run ios:run         # build + sync + run
```

## Конфигурация

### Bundle ID и имя

В `packages/web/capacitor.config.ts`:
- `appId: 'online.akkdmsg.dakka'` — изменить при необходимости
- `appName: 'Dakka'` — отображаемое имя

### API-сервер

По умолчанию native-сборка ходит на `https://akkdmsg.online/api`. Чтобы переопределить, создай `packages/web/.env.production`:

```env
VITE_API_URL=https://your-server.com/api
VITE_SOCKET_URL=https://your-server.com
```

Эти переменные подцепятся при `npm run build`.

### Live-reload с прод-сервера (опционально)

Если хочешь чтобы приложение подгружало JS прямо с прод-домена (как PWA в нативной обёртке) — раскомментируй `server.url` в `capacitor.config.ts`:

```ts
server: { url: 'https://akkdmsg.online', cleartext: false }
```

Тогда `npm run ios:sync` копирует только пустой shell; контент тянется с домена. Это позволяет деплоить фронт без пересборки IPA.

## Что уже работает в native-сборке

- ✅ E2E-шифрование (libsodium компилируется в WASM)
- ✅ Видео/аудио звонки (WebRTC в WKWebView, iOS 14.3+)
- ✅ Голосовые сообщения, видео-кружки (MediaRecorder в WebView работает с iOS 14.5+)
- ✅ Push-уведомления через APNs (Capacitor PushNotifications → бэкенд endpoint `/api/push/native-token`)
- ✅ Status bar в dark-стиле, прозрачный
- ✅ Safe-area inset (notch, home bar) обрабатывается через CSS `env(safe-area-inset-*)`
- ✅ Подъём верстки при появлении клавиатуры
- ✅ Haptic feedback (отправка сообщения, начало записи)
- ✅ App lifecycle (foreground/background)
- ✅ Network status

## Что нужно дописать вручную

1. **APNs-сертификат**. В Apple Developer Console → Certificates → создай **Apple Push Notification Service SSL** сертификат для `online.akkdmsg.dakka`. Залей в Xcode → Signing & Capabilities → "+ Capability" → Push Notifications.
2. **Иконки приложения**. В Xcode → `App/Assets.xcassets/AppIcon.appiconset/` положи свои PNG (нужны размеры 20pt, 29pt, 40pt, 60pt, 76pt, 83.5pt, 1024px). Шаблон 1024×1024 на бренд-градиенте — в `packages/web/public/logo.svg`.
3. **Splash screen**. По умолчанию использует `#0b0a14` фон. Кастомное изображение — в `App/Assets.xcassets/Splash.imageset/`.
4. **Бэкенд отправки APNs**. Сейчас токены сохраняются в Redis по ключу `push:native:<userId>`, но отправка через APNs не реализована. Добавь `@parse/node-apn` или `apns2` в `packages/backend` и реализуй отправку.

## Публикация в App Store

1. В Xcode → Product → Archive
2. Window → Organizer → выбрать архив → Distribute App → App Store Connect
3. В App Store Connect → создать приложение, заполнить метаданные, привязать сборку, отправить на ревью

## Частые проблемы

- **Pod install падает**: `cd packages/web/ios/App && pod install --repo-update`
- **Сертификат WebRTC не работает**: убедись что прод-домен (`akkdmsg.online`) отдаёт валидный SSL (не self-signed). В `deploy.sh` сейчас самоподписанный — для прод нужен Let's Encrypt.
- **Push не приходит**: проверь APNs сертификат, проверь что устройство залогинено в iCloud, проверь логи бэкенда на наличие отправки.
- **WebView показывает белый экран**: проверь что `webDir: 'dist'` существует и что `npm run build` отработал.
