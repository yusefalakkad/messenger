# Dakka — десктоп для macOS и Windows

Полноценное нативное приложение (Electron), как Telegram Desktop: интерфейс
**зашит внутрь** приложения и грузится мгновенно с локального адреса, а к серверу
(`akkdmsg.online`) идут только запросы данных. Это НЕ «окно с сайтом».

## Как устроено

Внутри приложения поднимается крошечный локальный сервер, который:
- отдаёт собранный SPA из `renderer/` (с fallback на `index.html` для роутинга);
- прозрачно проксирует `/api` и `/socket.io` на боевой сервер.

Renderer видит всё как «свой origin» (`http://127.0.0.1`), поэтому cookie,
авторизация и WebRTC (звонки, камера, микрофон) работают **без изменений в бэке**.
См. [main.js](main.js).

## Запуск (разработка)

```bash
cd apps/desktop
npm install
npm start                 # соберёт фронт и откроет приложение (прод-сервер)
```

К локальному бэку (для разработки):

```bash
MESSENGER_URL=http://localhost:4000 npm start
```

> `npm start` каждый раз пересобирает фронт. Если фронт уже собран (`npm run bundle`),
> можно быстрее: `npm run start:nobundle`.

## Сборка .dmg (установщик)

```bash
cd apps/desktop
npm install
npm run dist:mac          # arm64 + x64 → apps/desktop/release/
# или один универсальный бинарь:
npm run dist:mac:universal
```

Готовый `Dakka-1.0.0.dmg` появится в `apps/desktop/release/`. Открыть →
перетащить **Dakka** в **Applications**.

> ⚠️ Сборка не подписана (нет Apple Developer-сертификата). При первом запуске
> macOS скажет «приложение от неустановленного разработчика» — правый клик по
> приложению → **Open**, либо **System Settings → Privacy & Security → Open Anyway**.
> Для распространения без предупреждений нужны подпись (`codesign`) и нотаризация
> (`notarytool`) с Apple Developer ID.

## Сборка для Windows (.exe)

Тот же код, тот же зашитый SPA — просто другой таргет electron-builder.

```bash
cd apps/desktop
npm install
npm run dist:win              # инсталлятор + portable → apps/desktop/release/
# только portable (один файл, без установки):
npm run dist:win:portable
```

В `apps/desktop/release/` появятся:
- **`Dakka-Setup-1.0.0.exe`** — обычный установщик (NSIS): выбор папки, ярлык на
  рабочем столе и в меню «Пуск», деинсталлятор.
- **`Dakka-1.0.0-portable.exe`** — портативная версия: один файл, запускается без
  установки (как Telegram Portable).

Запускать сборку под Windows можно как на самом Windows, так и **кросс-сборкой
с macOS/Linux** — electron-builder сам скачает Windows-бинарники Electron.

> ⚠️ Сборка не подписана (нет code-signing сертификата Authenticode). При первом
> запуске Windows SmartScreen покажет «Windows protected your PC» → **Подробнее
> (More info)** → **Выполнить в любом случае (Run anyway)**. Чтобы убрать
> предупреждение, нужен EV/OV code-signing сертификат.
>
> ℹ️ Окно, ярлыки и панель задач используют иконку Dakka. В кросс-сборке с macOS
> сознательно отключён `signAndEditExecutable` (иначе для записи иконки в сам
> `.exe` потребовался бы Wine), поэтому в свойствах файла `Dakka.exe` иконка может
> остаться дефолтной от Electron — на работу это не влияет. На сборке под самим
> Windows это поле можно вернуть, убрав `"signAndEditExecutable": false` из
> `build.win` в [package.json](package.json).

### Кросс-сборка без выхода в интернет (офлайн / закрытая сеть)

Если у машины нет прямого доступа к `github.com` (electron-builder качает оттуда
Electron, NSIS и winCodeSign), бинарники можно подложить заранее и раздать с
локального адреса:

```bash
# 1) скачать там, где интернет есть:
#    electron-v<ver>-win32-x64.zip  (github.com/electron/electron)
#    nsis-3.0.4.1.7z, nsis-resources-3.4.1.7z, winCodeSign-2.6.0.7z
#      (github.com/electron-userland/electron-builder-binaries)
#    разложив .7z как <name>/<name>.7z, а zip распаковав в каталог electron-win/

# 2) раздать .7z по http и собрать, указав зеркало и локальный Electron:
ELECTRON_BUILDER_BINARIES_MIRROR="http://127.0.0.1:8799/" \
  npx electron-builder --win \
  -c.electronDist=electron-win -c.electronVersion=<ver>
```

## Обновление

Фронт **зашит** в приложение, поэтому при изменениях UI нужно пересобрать
установщик (`npm run dist:mac` / `npm run dist:win`) и переустановить. Серверная
часть (бэкенд) обновляется отдельно
на сервере — приложение подхватит её автоматически, т.к. данные тянутся с
`akkdmsg.online`.

Сменить целевой сервер можно переменной `MESSENGER_URL` (по умолчанию
`https://akkdmsg.online`).
