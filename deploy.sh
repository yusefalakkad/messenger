#!/bin/bash
set -e

# ─── Цвета ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }

# ─── Проверка .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    cp .env.example .env
    warn ".env создан из .env.example"
    warn "Открой .env и замени YOUR_SERVER_IP на реальный IP сервера!"
    warn "Также поменяй JWT_ACCESS_SECRET и JWT_REFRESH_SECRET на случайные строки."
    echo ""
    read -p "Продолжить после редактирования .env? [y/N] " confirm
    [ "$confirm" != "y" ] && error "Прерываю. Отредактируй .env и запусти заново."
fi

# Загружаем .env
set -a; source .env; set +a

[ -z "$SERVER_IP" ] || [ "$SERVER_IP" = "YOUR_SERVER_IP" ] && \
    error "SERVER_IP не задан в .env! Укажи IP или домен сервера."

# ─── SSL сертификат ───────────────────────────────────────────────────────────
mkdir -p nginx/ssl
if [ ! -f nginx/ssl/cert.pem ]; then
    info "Генерируем самоподписанный SSL сертификат для $SERVER_IP..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=RU/ST=State/L=City/O=Messenger/CN=$SERVER_IP" 2>/dev/null
    info "SSL сертификат создан: nginx/ssl/cert.pem"
fi

# ─── Права на скрипты ─────────────────────────────────────────────────────────
chmod +x entrypoint.sh coturn/entrypoint.sh

# ─── Остановка старого ────────────────────────────────────────────────────────
info "Останавливаем старые контейнеры..."
docker compose down --remove-orphans 2>/dev/null || docker-compose down --remove-orphans 2>/dev/null || true

# ─── Сборка и запуск ──────────────────────────────────────────────────────────
info "Собираем и запускаем (это займёт 3-5 минут при первом запуске)..."
docker compose up --build -d 2>/dev/null || docker-compose up --build -d

# ─── Готово ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Мессенджер запущен!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Открой в браузере: ${YELLOW}https://$SERVER_IP${NC}"
echo ""
echo -e "  ${YELLOW}Внимание:${NC} браузер покажет предупреждение о самоподписанном"
echo -e "  сертификате — нажми «Дополнительно» → «Перейти на сайт»."
echo -e "  Это нужно для работы микрофона и камеры (WebRTC требует HTTPS)."
echo ""
echo -e "  Логи:  docker compose logs -f"
echo -e "  Стоп:  docker compose down"
echo ""
