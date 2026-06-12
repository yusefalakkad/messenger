// Dakka — Electron-обёртка для macOS.
// Грузит развёрнутый веб-клиент (по умолчанию https://akkdmsg.online) в нативном
// окне: свой dock-значок, hiddenInset-заголовок в стиле macOS, разрешения на
// микрофон/камеру для звонков, внешние ссылки — в системном браузере.
//
// URL переопределяется переменной окружения:
//   MESSENGER_URL=http://localhost:5173 npm start   — например, локальная разработка.

const { app, BrowserWindow, shell, Menu, session, nativeTheme } = require('electron');
const path = require('path');

const APP_URL = process.env.MESSENGER_URL || 'https://akkdmsg.online';
// Хост(ы), которые открываем ВНУТРИ окна. Всё остальное — во внешнем браузере.
const INTERNAL_HOSTS = new Set([new URL(APP_URL).host]);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    show: false,
    // Тёмный фон до загрузки страницы — чтобы не было белой вспышки.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17151e' : '#f4f2f7',
    titleBarStyle: 'hiddenInset',     // нативный «утопленный» светофор macOS
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Медиа (WebRTC) требует безопасного контекста — https-URL это обеспечивает.
      spellcheck: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  // Показываем окно только когда контент готов — без «пустого» кадра.
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Внешние ссылки (target=_blank / window.open) — в системном браузере,
  // а не новым Electron-окном.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (!INTERNAL_HOSTS.has(new URL(url).host)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch { /* кривой url — просто откроем во внешнем */ }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Навигацию на чужие домены тоже уводим во внешний браузер.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (!INTERNAL_HOSTS.has(new URL(url).host)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch { /* ignore */ }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Разрешаем микрофон/камеру/уведомления для нашего домена (звонки, голосовые).
function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'camera', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });
}

// Минимальное нативное меню (Cmd+Q, копирование, перезагрузка, во весь экран).
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Правка',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Окно',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  setupPermissions();
  buildMenu();
  createWindow();

  // macOS: клик по значку в доке при закрытых окнах — открываем заново.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// На macOS приложение живёт в доке даже без окон — стандартное поведение.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
