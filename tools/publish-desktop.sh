#!/bin/bash
#
# publish-desktop.sh — публикация десктоп-установщиков для раздачи через nginx /download.
#
# electron-builder кладёт артефакты с версией в имени (Dakka-1.0.0-arm64.dmg,
# Dakka-Setup-1.0.0.exe), а фронт ссылается на СТАБИЛЬНЫЕ имена (Dakka.dmg,
# Dakka-Setup.exe — см. packages/web/src/lib/desktopDownload.ts). Этот скрипт
# берёт последние сборки из apps/desktop/release/ и копирует их в nginx/download/
# под стабильными именами. docker-compose монтирует nginx/download/ в контейнер.
#
# Использование:
#   tools/publish-desktop.sh              # локально: release/ → nginx/download/
#   tools/publish-desktop.sh --upload     # + scp на сервер (SERVER_IP из .env)
#
set -euo pipefail

cd "$(dirname "$0")/.."   # корень репозитория

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }

RELEASE_DIR="apps/desktop/release"
DEST_DIR="nginx/download"

[ -d "$RELEASE_DIR" ] || error "Нет $RELEASE_DIR. Сначала собери: cd apps/desktop && npm run dist:mac && npm run dist:win"
mkdir -p "$DEST_DIR"

# Берём самый свежий файл по маске (на случай нескольких версий в release/).
latest() {
  # shellcheck disable=SC2012
  ls -t $1 2>/dev/null | head -n1 || true
}

DMG=$(latest "$RELEASE_DIR/Dakka-*-arm64.dmg")
EXE=$(latest "$RELEASE_DIR/Dakka-Setup-*.exe")

published=0
if [ -n "$DMG" ]; then
  cp -f "$DMG" "$DEST_DIR/Dakka.dmg"
  info "macOS:   $(basename "$DMG") → $DEST_DIR/Dakka.dmg"
  published=$((published + 1))
else
  warn "Не найден .dmg (apps/desktop && npm run dist:mac) — пропускаю macOS."
fi

if [ -n "$EXE" ]; then
  cp -f "$EXE" "$DEST_DIR/Dakka-Setup.exe"
  info "Windows: $(basename "$EXE") → $DEST_DIR/Dakka-Setup.exe"
  published=$((published + 1))
else
  warn "Не найден .exe (apps/desktop && npm run dist:win) — пропускаю Windows."
fi

[ "$published" -gt 0 ] || error "Нечего публиковать — нет ни .dmg, ни .exe в $RELEASE_DIR."

echo ""
info "Готово локально. Содержимое $DEST_DIR:"
ls -lh "$DEST_DIR" | grep -vE '^total|\.gitkeep' || true

# ─── Опциональная заливка на сервер ───────────────────────────────────────────
if [ "${1:-}" = "--upload" ]; then
  [ -f .env ] && { set -a; source .env; set +a; }
  : "${SERVER_IP:?SERVER_IP не задан в .env — некуда заливать}"
  REMOTE_DIR="${REMOTE_PATH:-/root/messenger}/nginx/download"
  echo ""
  info "Заливаю на ${SERVER_IP}:${REMOTE_DIR} (попросит пароль root)..."
  ssh "root@${SERVER_IP}" "mkdir -p '${REMOTE_DIR}'"
  scp "$DEST_DIR"/Dakka*.dmg "$DEST_DIR"/Dakka*.exe "root@${SERVER_IP}:${REMOTE_DIR}/" 2>/dev/null || \
    scp "$DEST_DIR"/Dakka.dmg "$DEST_DIR"/Dakka-Setup.exe "root@${SERVER_IP}:${REMOTE_DIR}/"
  info "Файлы на сервере. Перезапусти nginx, чтобы он увидел volume (если впервые):"
  echo -e "    ${YELLOW}ssh root@${SERVER_IP} 'cd ${REMOTE_PATH:-/root/messenger} && docker compose up -d nginx'${NC}"
fi
