# Dakka — десктоп для macOS

Нативное окно вокруг развёрнутого веб-клиента Dakka (Electron). Своё окно в стиле
macOS, dock-значок, разрешения на микрофон/камеру для звонков, внешние ссылки
открываются в системном браузере.

## Запуск (разработка)

```bash
cd apps/desktop
npm install
npm start
```

По умолчанию открывается прод: `https://akkdmsg.online`.
Чтобы открыть локальную разработку:

```bash
MESSENGER_URL=http://localhost:5173 npm start
```

## Сборка .dmg (установщик)

```bash
cd apps/desktop
npm install
npm run dist:mac          # arm64 + x64 (.dmg в apps/desktop/release/)
# или один универсальный бинарь:
npm run dist:mac:universal
```

Готовый `Dakka-1.0.0.dmg` появится в `apps/desktop/release/`. Открыть → перетащить
**Dakka** в **Applications**.

> ⚠️ Сборка не подписана (нет Apple Developer-сертификата). При первом запуске
> macOS покажет «приложение от неустановленного разработчика» — открыть через
> **System Settings → Privacy & Security → Open Anyway**, либо правый клик по
> приложению → **Open**. Для распространения без предупреждений нужны подпись
> (`codesign`) и нотаризация (`notarytool`) с Apple Developer ID.

## Как это устроено

Это «тонкая» обёртка: окно грузит сайт `akkdmsg.online`, поэтому десктоп всегда
показывает ту же версию, что и веб — отдельная пересборка приложения при
обновлении фронта не нужна. Конфигурация — в [package.json](package.json)
(блок `build`, electron-builder) и [main.js](main.js).

Если позже захотите **офлайн-бандл** фронта внутрь приложения (грузить локальные
файлы вместо URL) — собрать `packages/web` с `VITE_API_URL=https://akkdmsg.online/api`,
кластерить `dist/` в `files`, и в `main.js` заменить `loadURL(APP_URL)` на
`loadFile('dist/index.html')`. Потребуется включить CORS на бэке для origin
приложения.
