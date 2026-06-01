#!/usr/bin/env bash
# Ротация секретов Dakka.
#
# Что делает:
#   1. Генерирует новые JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, TURN_SECRET,
#      POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO_ROOT_PASSWORD
#   2. Записывает в /root/messenger/.env на VPS через ssh
#   3. Делает резервную копию старого .env
#   4. Перезапускает контейнеры
#   5. TRUNCATE TABLE "Session" — invalidate ВСЕ refresh-токены
#   6. Печатает чек-лист действий, которые надо сделать руками (Cloudflare token)
#
# Использование:
#   tools/rotate-secrets.sh user@vps-host[:port] [/abs/path/to/messenger]
#
# Пример:
#   tools/rotate-secrets.sh root@akkdmsg.online /root/messenger

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fatal() { echo -e "${RED}[x]${NC} $1"; exit 1; }
hdr()   { echo ""; echo -e "${CYAN}━━━ $1 ━━━${NC}"; }

SSH_TARGET="${1:-}"
REMOTE_DIR="${2:-/root/messenger}"
[ -n "$SSH_TARGET" ] || fatal "Usage: $0 user@host[:port] [/remote/path]"

command -v openssl >/dev/null || fatal "openssl не найден локально"
command -v ssh     >/dev/null || fatal "ssh не найден локально"

# ─── 1. Генерируем новые секреты ──────────────────────────────────────────────
hdr "Генерация новых секретов"
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
TURN_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-32)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-32)
MINIO_ROOT_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-32)
WEBHOOK_SECRET=$(openssl rand -hex 24)
info "6 новых секретов сгенерированы (по 32+ байт энтропии)"

# ─── 2. На VPS: бэкап + переписать .env + reset Session + restart ────────────
hdr "Применение на VPS ($SSH_TARGET)"

ssh "$SSH_TARGET" bash -s <<EOF
set -euo pipefail
cd "$REMOTE_DIR" || { echo "FATAL: $REMOTE_DIR не существует"; exit 1; }
[ -f .env ] || { echo "FATAL: $REMOTE_DIR/.env не существует"; exit 1; }

# Бэкап (доступно только root)
STAMP=\$(date +%Y%m%d_%H%M%S)
cp .env ".env.backup.\$STAMP"
chmod 600 ".env.backup.\$STAMP"
echo "[+] .env -> .env.backup.\$STAMP"

# Замена секретов в .env (idempotent)
upsert() {
  local key=\$1 val=\$2
  if grep -q "^\${key}=" .env; then
    sed -i "s|^\${key}=.*|\${key}=\${val}|" .env
  else
    echo "\${key}=\${val}" >> .env
  fi
}

upsert JWT_ACCESS_SECRET   "$JWT_ACCESS_SECRET"
upsert JWT_REFRESH_SECRET  "$JWT_REFRESH_SECRET"
upsert TURN_SECRET         "$TURN_SECRET"
upsert POSTGRES_PASSWORD   "$POSTGRES_PASSWORD"
upsert REDIS_PASSWORD      "$REDIS_PASSWORD"
upsert MINIO_ROOT_PASSWORD "$MINIO_ROOT_PASSWORD"
upsert TELEGRAM_WEBHOOK_SECRET "$WEBHOOK_SECRET"

# Если есть DATABASE_URL — пересобираем с новым паролем
PG_USER=\$(grep '^POSTGRES_USER=' .env | cut -d= -f2)
PG_DB=\$(grep '^POSTGRES_DB=' .env | cut -d= -f2)
if grep -q '^DATABASE_URL=' .env; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://\${PG_USER}:$POSTGRES_PASSWORD@postgres:5432/\${PG_DB}|" .env
fi
if grep -q '^REDIS_URL=' .env; then
  sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:$REDIS_PASSWORD@redis:6379|" .env
fi

echo "[+] .env обновлён"

# Перезапуск контейнеров — postgres/redis надо пересоздать чтобы взяли новые пароли
docker compose down
docker compose up -d --build

# Ждём postgres
echo "[+] Жду postgres..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  docker exec messenger_postgres pg_isready -U "\$PG_USER" >/dev/null 2>&1 && break
  sleep 2
done

# Invalidate все активные сессии (форсит всех клиентов перелогиниться)
docker exec messenger_postgres psql -U "\$PG_USER" -d "\$PG_DB" -c 'TRUNCATE TABLE "Session";' || true
echo "[+] Все Session-записи удалены — все клиенты будут перелогинены"

EOF

hdr "Готово ✓"
echo ""
echo -e "${GREEN}Секреты ротированы на $SSH_TARGET.${NC}"
echo ""
echo -e "${YELLOW}ВРУЧНУЮ нужно сделать ещё:${NC}"
echo -e "  1. ${CYAN}Cloudflare Tunnel:${NC}"
echo -e "     • Открой dash.cloudflare.com → Zero Trust → Networks → Tunnels"
echo -e "     • Удали текущий туннель (он скомпрометирован)"
echo -e "     • Создай новый с теми же hostname'ами"
echo -e "     • Скопируй новый CLOUDFLARE_TUNNEL_TOKEN"
echo -e "     • SSH на VPS: nano $REMOTE_DIR/.env → подставь токен → docker compose restart cloudflared"
echo ""
echo -e "  2. ${CYAN}Telegram bot:${NC} если SMS_PROVIDER=telegram-bot,"
echo -e "     убедись что TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_URL заданы."
echo ""
echo -e "  3. ${CYAN}Push (опционально):${NC}"
echo -e "     • APNS_KEY/APNS_KEY_ID/APNS_TEAM_ID для iOS push (если используется)"
echo -e "     • FCM_SERVICE_ACCOUNT для Android push (если используется)"
echo ""
