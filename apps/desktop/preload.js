// Preload изолирован (contextIsolation). Веб-клиент Dakka не требует мостов в
// Node — оставляем пустым, но помечаем «мы в десктоп-обёртке» для возможной
// future-логики (напр. скрыть кнопку «Скачать» внутри уже-установленного app).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dakkaDesktop', {
  isDesktop: true,
  platform: process.platform,
  // Уведомление об обновлении: main-процесс сам сверяет версию с сайтом (Node,
  // без CORS) и зовёт этот колбэк с ссылкой на установщик под текущую ОС.
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('dakka:update-available', (_e, data) => { try { cb(data); } catch { /* */ } });
  },
});
