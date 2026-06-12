// Preload изолирован (contextIsolation). Веб-клиент Dakka не требует мостов в
// Node — оставляем пустым, но помечаем «мы в десктоп-обёртке» для возможной
// future-логики (напр. скрыть кнопку «Скачать» внутри уже-установленного app).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('dakkaDesktop', {
  isDesktop: true,
  platform: process.platform,
});
