# Сборка Android-приложения (Capacitor)

Тот же React-код, что и для веба и iOS, упакован в нативный Android-шелл через **Capacitor 6**. Минимум разработки — максимум переиспользования.

## Требования (один раз)

- **Android Studio** (Hedgehog 2023.1.1 или новее) — [download](https://developer.android.com/studio)
- **JDK 17+** (идёт в комплекте с Android Studio, либо `brew install --cask zulu@17`)
- **Android SDK + Platform Tools** (устанавливаются через SDK Manager в Android Studio)
- **ANDROID_HOME** в переменных окружения:

  ```bash
  # ~/.zshrc
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
  ```

- Google аккаунт для **Firebase Console** (для FCM push-уведомлений)
- Google Play Console account ($25 единоразово) — для публикации

Можно работать без Android Studio через CLI, но Android Studio проще для первого раза.

## Первая инициализация Android-проекта

Выполнить **один раз** в `packages/web`:

```bash
cd packages/web
npm run build                # собирает dist/
npm run android:init         # создаёт папку android/ с Gradle-проектом
npm run android:sync         # build + копирование dist/ + capacitor plugins
```

После этого в `packages/web/android/` появится готовый Android Studio проект.

## Открытие в Android Studio и запуск

```bash
npm run android:open
```

Android Studio откроет проект, индексация займёт ~3-5 мин. Затем:
1. Подключи Android-устройство по USB (включи **Developer Options** → **USB Debugging** в настройках телефона) ИЛИ создай эмулятор через Device Manager
2. В верхнем баре выбери устройство
3. Жми ▶ (Shift+F10)

## Цикл разработки

```bash
npm run android:sync         # после изменения кода — build + sync в android/
# затем в Android Studio жми ▶
```

Или одной командой:

```bash
npm run android:run          # build + sync + run
```

## Конфигурация

### Application ID и имя

В `packages/web/capacitor.config.ts`:
- `appId: 'online.akkdmsg.dakka'` — это будет `applicationId` в Android
- `appName: 'Dakka'`

### API-сервер

Тот же `.env.production` что и для iOS — переменные `VITE_API_URL` / `VITE_SOCKET_URL`. По умолчанию native-сборки ходят на `https://akkdmsg.online`.

## Push-уведомления через FCM

Capacitor PushNotifications на Android использует **Firebase Cloud Messaging**.

1. Зайди в [Firebase Console](https://console.firebase.google.com/) → Add project → выбери название (например, "dakka-prod")
2. Add app → **Android** → введи Package name = `online.akkdmsg.dakka`
3. Скачай `google-services.json` → положи в `packages/web/android/app/google-services.json`
   (этот файл уже в `.gitignore` — не коммитим)
4. Перезапусти `npm run android:sync`

После регистрации, FCM-токен автоматически отправится на `/push/native-token` (тот же endpoint что и для APNs).

Для **отправки** пушей с бэка нужно добавить serviceAccountKey из Firebase Console → Project Settings → Service Accounts → Generate new private key → положить в `packages/backend` (например, `firebase-admin.json`, в gitignore) и реализовать send через `firebase-admin` npm пакет.

## Подпись приложения (release-сборка для Play Store)

Создай keystore (один раз):

```bash
cd packages/web/android/app
keytool -genkey -v -keystore dakka-release.keystore \
  -alias dakka -keyalg RSA -keysize 2048 -validity 10000
```

⚠️ **СОХРАНИ ПАРОЛЬ И KEYSTORE** — без них ты не сможешь обновлять опубликованное приложение!

Создай `packages/web/android/keystore.properties` (в gitignore):

```
storePassword=your_password
keyPassword=your_password
keyAlias=dakka
storeFile=dakka-release.keystore
```

В `packages/web/android/app/build.gradle` уже есть signingConfigs для release-сборки (Capacitor создаёт шаблон).

Собрать AAB для Google Play:

```bash
cd packages/web/android
./gradlew bundleRelease
# результат: app/build/outputs/bundle/release/app-release.aab
```

Или собрать APK для прямой установки:

```bash
./gradlew assembleRelease
# результат: app/build/outputs/apk/release/app-release.apk
```

## Что уже работает в Android-сборке

- ✅ E2E-шифрование (libsodium компилируется в WASM, работает в WebView)
- ✅ Видео/аудио звонки (WebRTC, Android 5.0+)
- ✅ Голосовые сообщения, видео-кружки (MediaRecorder API)
- ✅ Push через FCM (после настройки google-services.json)
- ✅ Status bar dark, прозрачный
- ✅ Edge-to-edge (Android 15+) — safe-area через CSS env()
- ✅ Подъём верстки при появлении клавиатуры
- ✅ Haptic feedback (vibration API через Capacitor Haptics)
- ✅ App lifecycle, back button, network status

## Различия с iOS

- **Back button**: Android имеет аппаратную кнопку «назад» (или жест) — в [native.ts](../packages/web/src/lib/native.ts) уже обрабатывается через `CapApp.addListener('backButton')`
- **Push**: FCM (Android) vs APNs (iOS) — клиентский API один (`@capacitor/push-notifications`), серверная отправка разная
- **Safe area**: на Android актуально только для edge-to-edge экранов (с прозрачным status bar)
- **Permissions**: Android просит разрешения в рантайме как и iOS, обрабатывается Capacitor'ом

## Публикация в Google Play

1. Создай [Play Console аккаунт](https://play.google.com/console) ($25)
2. Создай приложение, заполни Store Listing (название, описание, скриншоты, иконка)
3. Загрузи AAB через Play Console → Production → Create new release
4. Пройди ревью (1-7 дней)

## Частые проблемы

- **Gradle sync падает**: `cd packages/web/android && ./gradlew clean && ./gradlew build`
- **WebRTC не работает**: проверь что в `AndroidManifest.xml` есть `<uses-permission android:name="android.permission.RECORD_AUDIO" />` и `CAMERA` (Capacitor добавляет автоматически после `cap sync`)
- **Push не приходит**: убедись что `google-services.json` в правильном пути и FCM Sender ID совпадает
- **WebView не загружает HTTPS с самоподписанным сертом**: для прод-домена нужен валидный SSL (Let's Encrypt). Текущий `deploy.sh` использует самоподписанный — на Android это категорически не работает (в отличие от iOS, где есть про-флаг для разработки).
- **Edge-to-edge ломает верстку**: убедись что элементы верхнего ряда используют `pt-safe`, нижнего — `pb-safe`/`pb-input`
