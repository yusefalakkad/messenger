// Dakka — нативное десктоп-приложение для macOS (Electron).
//
// Это НЕ «окно с сайтом»: фронтенд (renderer/) ЗАШИТ внутрь приложения и грузится
// локально с http://127.0.0.1 — мгновенно, как у Telegram Desktop. Внутри приложения
// поднимается крошечный локальный сервер, который:
//   • отдаёт статику SPA из renderer/ (с fallback на index.html для роутинга),
//   • прозрачно проксирует /api и /socket.io на боевой сервер (akkdmsg.online).
//
// Renderer считает всё «своим origin» (localhost) → cookie и CORS работают
// без изменений в бэке и без переписывания авторизации. localhost — secure
// context, поэтому WebRTC (звонки/камера/микрофон) тоже работает.
//
// Сервер переопределяется переменной окружения:
//   MESSENGER_URL=http://localhost:4000 npm start   — например, локальный бэк.

const { app, BrowserWindow, shell, Menu, session, nativeTheme } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');

// Куда проксировать данные (бэкенд + сокеты). Фронт всегда локальный.
const TARGET = process.env.MESSENGER_URL || 'https://akkdmsg.online';
const RENDERER_DIR = path.join(__dirname, 'renderer');

let mainWindow = null;
let localPort = 0;

// ─── Локальный сервер: статика SPA + reverse-proxy на бэкенд ──────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

const isApiPath = (url) => url.startsWith('/api') || url.startsWith('/socket.io');

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const proxy = httpProxy.createProxyServer({
      target: TARGET,
      changeOrigin: true,        // Host → akkdmsg.online (nginx роутит по Host)
      secure: false,             // принимаем self-signed сертификат сервера
      cookieDomainRewrite: '',   // refresh-cookie привязываем к localhost
      ws: true,
      xfwd: true,
    });
    proxy.on('error', (err) => { console.error('[proxy]', err.message); });

    const server = http.createServer((req, res) => {
      if (isApiPath(req.url)) { proxy.web(req, res); return; }

      let pathname = decodeURIComponent(req.url.split('?')[0]);
      if (pathname === '/') pathname = '/index.html';
      const file = path.join(RENDERER_DIR, pathname);

      // защита от выхода за пределы renderer/
      if (!file.startsWith(RENDERER_DIR)) { res.writeHead(403); res.end(); return; }

      fs.readFile(file, (err, data) => {
        if (err) {
          // SPA-fallback: любой неизвестный путь → index.html (client-side routing)
          fs.readFile(path.join(RENDERER_DIR, 'index.html'), (e2, html) => {
            if (e2) { res.writeHead(404); res.end('renderer not built'); return; }
            res.writeHead(200, { 'Content-Type': MIME['.html'] });
            res.end(html);
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });

    // socket.io websocket-апгрейд → проксируем
    server.on('upgrade', (req, sock, head) => {
      if (isApiPath(req.url)) proxy.ws(req, sock, head);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      localPort = server.address().port;
      resolve(localPort);
    });
  });
}

// ─── Окно ─────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17151e' : '#f4f2f7',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${localPort}/`);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Внешние ссылки (не наш localhost) — в системном браузере.
  const isInternal = (url) => { try { return new URL(url).hostname === '127.0.0.1'; } catch { return false; } };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isInternal(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Разрешаем микрофон/камеру/уведомления (звонки, голосовые).
function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'microphone', 'camera', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' },
    ] }] : []),
    { label: 'Правка', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'Вид', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { label: 'Окно', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ]));
}

app.whenReady().then(async () => {
  setupPermissions();
  buildMenu();
  try {
    await startLocalServer();
  } catch (err) {
    console.error('[desktop] local server failed', err);
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
