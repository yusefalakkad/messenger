#!/bin/bash
set -e

# Запуск мессенджера с ноута через Cloudflare Tunnel.
# Домен: akkdmsg.online. Открытые порты/белый IP не нужны.

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }
step()  { echo ""; echo -e "${CYAN}━━━ $1 ━━━${NC}"; }

# ─── Проверка docker ─────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || error "Не найден docker. Установи Docker Desktop."
docker info >/dev/null 2>&1 || error "Docker не запущен. Открой Docker Desktop."

# ─── Создание .env ───────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    cp .env.example .env
    info ".env создан из .env.example"

    # Автогенерация JWT секретов
    JWT_A=$(openssl rand -hex 32)
    JWT_R=$(openssl rand -hex 32)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$JWT_A|"  .env
        sed -i '' "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$JWT_R|" .env
    else
        sed -i    "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$JWT_A|"  .env
        sed -i    "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$JWT_R|" .env
    fi
    info "JWT секреты сгенерированы автоматически"
fi

# ─── Получение токена туннеля ────────────────────────────────────────────────
set -a; source .env; set +a

if [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
    step "Нужен токен Cloudflare Tunnel"
    cat <<EOF

  1. Перейди в Cloudflare Zero Trust dashboard:
     ${CYAN}https://one.dash.cloudflare.com/${NC}
     (если аккаунта нет — заведи бесплатный, добавь домен ${YELLOW}akkdmsg.online${NC},
      Cloudflare покажет 2 NS-сервера → пропиши их в reg.ru вместо ns1.hosting.reg.ru)

  2. Networks → Tunnels → ${YELLOW}Create a tunnel${NC} → Cloudflared
     Имя туннеля: ${YELLOW}akkdmsg${NC} → Save

  3. На странице ${YELLOW}Install and run a connector${NC} скопируй ${YELLOW}token${NC}
     (длинная строка после ${CYAN}--token${NC} в показанной команде)

  4. Жми Next → Public Hostname:
       Subdomain: ${YELLOW}(пусто)${NC}
       Domain:    ${YELLOW}akkdmsg.online${NC}
       Service:   Type=${YELLOW}HTTP${NC}, URL=${YELLOW}nginx:80${NC}
     (По желанию добавь второй: Subdomain=${YELLOW}www${NC}, остальное так же.)

EOF
    read -p "Вставь токен сюда: " TOKEN
    [ -z "$TOKEN" ] && error "Токен пустой."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$TOKEN|" .env
    else
        sed -i    "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$TOKEN|" .env
    fi
    info "Токен сохранён в .env"
fi

# ─── Права на скрипты ────────────────────────────────────────────────────────
chmod +x entrypoint.sh coturn/entrypoint.sh

# ─── Остановка старого ───────────────────────────────────────────────────────
step "Останавливаем старые контейнеры"
docker compose -f docker-compose.tunnel.yml down --remove-orphans 2>/dev/null || true
docker compose                                  down --remove-orphans 2>/dev/null || true

# ─── Сборка и запуск ─────────────────────────────────────────────────────────
step "Собираем и запускаем (3-5 минут при первом запуске)"
# Отключаем BuildKit — он ломается на путях с не-ASCII символами
# (папка проекта называется кириллицей)
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0
docker compose -f docker-compose.tunnel.yml up --build -d

# ─── Готово ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Мессенджер запущен!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Открой: ${YELLOW}https://akkdmsg.online${NC}"
echo ""
echo -e "  Логи туннеля: ${CYAN}docker logs -f messenger_cloudflared${NC}"
echo -e "  Логи всего:   ${CYAN}docker compose -f docker-compose.tunnel.yml logs -f${NC}"
echo -e "  Стоп:         ${CYAN}docker compose -f docker-compose.tunnel.yml down${NC}"
echo ""
echo -e "  ${YELLOW}Внимание:${NC} пока ноут спит/выключен — мессенджер недоступен."
echo -e "  Звонки работают только если оба клиента в открытых сетях (STUN, без TURN)."
echo ""
