# Dakka — нативный Android-клиент

Kotlin + Jetpack Compose. Без Capacitor, без WebView. Параллельно iOS-приложению (`apps/ios/`), ходит на тот же `https://akkdmsg.online/api`.

## Структура

```
apps/android/
├── build.gradle.kts                ← root project
├── settings.gradle.kts
├── gradle.properties
├── gradle/libs.versions.toml       ← version catalog (Kotlin DSL)
└── app/
    ├── build.gradle.kts
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── res/
        │   ├── values/{colors, strings, themes}.xml
        │   └── mipmap-*/ic_launcher*.png   ← иконки (из tools/make_icon.py)
        └── java/online/akkdmsg/dakka/
            ├── DakkaApplication.kt
            ├── MainActivity.kt           ← @main, AnimatedContent auth ↔ chats
            ├── ui/theme/                 ← Color, Brand (gradients), Type, Theme
            ├── ui/components/            ← BrandButton, BrandTextField, AmbientBackground
            ├── data/                     ← AppConfig, Models, api/{ApiClient, AuthApi}
            ├── auth/                     ← AuthStore (EncryptedSharedPreferences), AuthScreen
            └── chats/                    ← ChatListScreen (placeholder)
```

## Первый запуск

### 1. Требования

- **Android Studio** Iguana 2023.2 или новее ([download](https://developer.android.com/studio))
- **JDK 17+** (идёт с Android Studio)
- **Android SDK** API 35 + Build Tools 34+ (SDK Manager → Android 15)
- **Emulator** API 34+ или физический Android-телефон с включённым USB debugging

### 2. Открыть проект

```bash
cd apps/android
open -a "Android Studio" .
```

Android Studio спросит про Gradle Wrapper — нажми «Use Gradle wrapper from project».
Если не предложит — File → Sync Project with Gradle Files.

⚠️ При первом синке Gradle качает зависимости (~300MB) — 5-10 минут.

### 3. Запуск

1. Сверху выбери target device (эмулятор или USB-устройство)
2. ▶ или Shift+F10

## Что работает

- 🎨 **Бренд-дизайн**: те же градиенты violet→pink→orange, dark theme, ambient-засветки что в iOS/web
- 🔐 **Auth**: login / register — реальные запросы на `https://akkdmsg.online/api/auth/*`
- 💾 **Сессия**: JWT и user сохраняются в EncryptedSharedPreferences (AES-256 + Android Keystore),
  переживает перезапуск приложения
- 🎭 **Тёмная тема**: edge-to-edge, прозрачный status bar
- ✨ **Анимации**: spring-press на кнопках, AnimatedContent для табов

## Что НЕ работает (TODO в следующих сессиях, по образцу iOS)

- ❌ **E2E-шифрование**: при регистрации сейчас публичный ключ не отправляется.
  Нужно интегрировать `androidx.security.crypto` + BouncyCastle или JCA с
  P-256 ECDH + AES-256-GCM (как в iOS CryptoKit, как в Web WebCrypto).
- ❌ **WebSocket**: socket.io-client-kotlin или нативный OkHttp WebSocket.
- ❌ **Список чатов, сообщения, реакции, реплаи, форварды**.
- ❌ **Голос, фото, видео-кружки** (CameraX + MediaRecorder).
- ❌ **Звонки**: GoogleWebRTC for Android + ConnectionService (аналог iOS CallKit).
- ❌ **Push (FCM)**: Firebase Cloud Messaging + регистрация токена на /push/native-token.

## Команды

```bash
# Из корня проекта или из apps/android
./gradlew :app:assembleDebug                # debug APK
./gradlew :app:assembleRelease              # release APK (для самосбора)
./gradlew :app:bundleRelease                # AAB для Play Store
./gradlew :app:installDebug                 # ставит APK на подключённое устройство
```

## Конфигурация

API-сервер по умолчанию `https://akkdmsg.online/api` (см. `data/AppConfig.kt`).
Чтобы переопределить через Gradle properties — добавь BuildConfig field в `build.gradle.kts`.

## Минимальная версия Android

**API 26 (Android 8.0 Oreo)** — для современного Compose UI, Java 17 features, edge-to-edge.

## Конфигурация подписи (для релиза)

См. [docs/ANDROID_BUILD.md](../../docs/ANDROID_BUILD.md) — там описан общий процесс
keystore + Play Store upload. Для нативного Android процесс тот же.
