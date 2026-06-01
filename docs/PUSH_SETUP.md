# Push-уведомления — серверная настройка

Бэкенд отправляет push на три канала:

| Канал | Стек | Куда |
|---|---|---|
| **Web** | VAPID + Service Worker | Браузеры (Chrome, Safari, Firefox, Edge) |
| **iOS** | APNs Auth Key (.p8) | iPhone/iPad (нативный и Capacitor) |
| **Android** | Firebase Cloud Messaging | Android (Capacitor) |

Web push работает из коробки (ключи генерятся автоматически). APNs и FCM — нужно один раз настроить.

## iOS (APNs)

### 1. Получить ключ

[developer.apple.com](https://developer.apple.com) → Account → Certificates, IDs & Profiles → **Keys** → "+"

- Name: `dakka-push`
- Enable: ☑ **Apple Push Notifications service (APNs)**
- Continue → Register → **Download** (получишь файл `AuthKey_XXXXXXXXXX.p8`)

⚠️ Файл можно скачать только один раз — сохрани в безопасное место.

Запомни:
- **Key ID** — это `XXXXXXXXXX` в имени файла (10 символов)
- **Team ID** — на главной странице developer account (правый верхний угол, ~10 символов)
- **Bundle ID** — `online.akkdmsg.dakka`

### 2. Прописать в .env

```env
APNS_BUNDLE_ID=online.akkdmsg.dakka
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=YYYYYYYYYY
# Скопируй ВСЁ содержимое .p8 файла, каждый перевод строки замени на \n:
APNS_KEY=-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqG...\n-----END PRIVATE KEY-----
APNS_PRODUCTION=false
```

`APNS_PRODUCTION`:
- `false` — sandbox (dev-сборка из Xcode, TestFlight ad-hoc билды)
- `true` — после релиза в App Store

⚠️ Если сборка из TestFlight не получает пуши — выставь `APNS_PRODUCTION=true`. У TestFlight сборок APNs-окружение зависит от типа entitlement (`development` vs `production` в `.entitlements`).

### 3. Перезапустить бэк

```bash
docker compose restart backend
# или для прода:
bash deploy.sh
```

В логах увидишь:
```
[push-native] APNs initialized { bundle: 'online.akkdmsg.dakka', production: false }
```

## Android (FCM)

### 1. Создать Firebase проект

[console.firebase.google.com](https://console.firebase.google.com) → Add project → выбери название (например, `dakka`).

В созданном проекте → Settings → Cloud Messaging → должно быть включено.

### 2. Получить service account ключ

Project settings → **Service Accounts** → Generate new private key → скачается `.json` файл.

### 3. Прописать в .env

Конвертируй JSON в одну строку (без переводов строк):

```bash
cat firebase-service-account.json | jq -c .
```

Полученное вставь в `.env`:
```env
FCM_SERVICE_ACCOUNT={"type":"service_account","project_id":"...",...}
```

### 4. На Android-клиенте

Capacitor-сборка требует `google-services.json`:
- В Firebase Console → Add app → **Android** → Package name = `online.akkdmsg.dakka`
- Скачать `google-services.json` → положить в `packages/web/android/app/google-services.json`
- Пересобрать: `npm run android:sync`

## VoIP push (iOS CallKit)

Отдельный канал для входящих звонков. Будит приложение даже когда оно убито,
показывает системный CallKit-баннер на lock-screen.

### Хорошие новости

С **token-based авторизацией** (.p8 ключ из APNs-секции выше) **отдельный
VoIP сертификат не нужен**. Тот же ключ работает для обычных и VoIP-пушей.
Разница только в `topic`:

- Обычный: `online.akkdmsg.dakka`
- VoIP:    `online.akkdmsg.dakka.voip`

Бэкенд автоматически выставляет правильный topic в `sendVoIPCallPush()`.

### Что нужно

На стороне Apple Developer Console для Bundle ID `online.akkdmsg.dakka`:
1. Capabilities → ✓ **Push Notifications**
2. Capabilities → ✓ **Voice over IP** (через `voip` background mode уже включён в Info.plist)

На клиенте iOS — всё уже сделано в `Core/Call/PushKitManager.swift` +
`CallKitProvider.swift`. При старте приложение регистрируется в PushKit
и шлёт VoIP-токен на `/push/voip-token`.

На бэкенде — всё уже сделано в `lib/push-native.ts:sendVoIPCallPush()`.
При получении `call:initiate` через socket бэк автоматически шлёт VoIP push
на iOS-устройство получателя.

### VoIP payload

```json
{
  "callId": "...",
  "chatId": "...",
  "callerId": "...",
  "callerName": "Иван",
  "callerAvatar": "https://...",
  "callType": "audio"
}
```

⚠️ Если приложение не вызывает `reportNewIncomingCall` после получения VoIP push,
iOS отключит VoIP пуши для приложения. Поэтому даже при поломанном payload
надо репортовать заглушку и сразу её завершать.

## Проверка end-to-end

Способ 1 — через приложение:
1. Войди в приложение на устройстве А → отправь сообщение пользователю Б
2. Пользователь Б должен быть **offline** (закрыто приложение или вышло из чата)
3. Push прилетит на устройство Б

Способ 2 — посмотреть Redis на наличие токенов:
```bash
docker exec -it messenger-redis-1 redis-cli
KEYS 'push:native:*'
SMEMBERS push:native:<userId>
```

Способ 3 — логи бэка:
```bash
docker compose logs -f backend | grep push-native
```

## Что отправляется

Push-payload минимальный (sealed-sender-lite):
```json
{
  "title": "Новое сообщение",
  "body":  "",
  "chatId": "<id>"
}
```

Без имени отправителя, без превью текста. Имя/превью клиент подтянет сам когда юзер откроет приложение → защита от утечки метаданных через push-провайдеров (Apple/Google) и историю уведомлений ОС.

На iOS клиент при тапе по уведомлению читает `data.chatId` и делает deep-link на нужный чат (см. `PushManager.userNotificationCenter(_:didReceive:withCompletionHandler:)`).

## Если что-то не работает

| Симптом | Возможная причина |
|---|---|
| `[push-native] APNs not configured` | Не выставлены `APNS_*` переменные |
| `[push-native] APNs init failed (install \`apn\` package)` | `npm install` не запущен в backend |
| `BadDeviceToken` в логах | Токен из dev-сборки используется с `APNS_PRODUCTION=true` (или наоборот) |
| `Unregistered` | Юзер удалил приложение — токен авточистится |
| FCM `invalid-registration-token` | Старый/несуществующий токен — авточистится |
| Push приходит на web, но не на iOS | Проверь что юзер на iOS дал permission в settings приложения |
