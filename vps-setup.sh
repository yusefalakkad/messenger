#!/bin/bash
# Полная настройка мессенджера на чистом Ubuntu VPS.
# Запускать на сервере: bash vps-setup.sh <domain>
# Пример: bash vps-setup.sh akkdmsg.online

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }
step()  { echo ""; echo -e "${CYAN}━━━ $1 ━━━${NC}"; }

DOMAIN="${1:-akkdmsg.online}"
EMAIL="${LE_EMAIL:-admin@${DOMAIN}}"

[ "$(id -u)" -eq 0 ] || error "Запускай под root (sudo bash $0 ...)"

step "Обновление пакетов"
apt-get update -qq
apt-get install -y -qq curl ca-certificates rsync git openssl ufw fail2ban unattended-upgrades

# ─── 0. SECURITY: firewall + brute-force + auto-updates ──────────────────────
step "Базовая защита VPS (UFW + fail2ban + SSH hardening)"

# UFW: default deny, открываем только нужные порты
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      comment 'SSH'
ufw allow 80/tcp      comment 'HTTP (redirect→443)'
ufw allow 443/tcp     comment 'HTTPS'
ufw allow 3478/tcp    comment 'TURN TCP'
ufw allow 3478/udp    comment 'TURN UDP'
ufw allow 5349/tcp    comment 'TURNS (TLS)'
ufw allow 50000:50200/udp comment 'TURN relay range'
ufw --force enable
info "UFW активирован, открыты только нужные порты"

# SSH hardening — выключаем password-auth (требует чтобы у тебя БЫЛ настроенный ~/.ssh/authorized_keys!)
if [ -f /root/.ssh/authorized_keys ] && [ -s /root/.ssh/authorized_keys ]; then
    sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
    sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/'  /etc/ssh/sshd_config
    sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
    sed -i 's/^#*UsePAM.*/UsePAM yes/' /etc/ssh/sshd_config
    systemctl reload sshd
    info "SSH: password-auth выключен (только ssh-key)"
else
    warn "SSH: в /root/.ssh/authorized_keys нет ключа — password-auth ОСТАВЛЕН включённым."
    warn "Положи свой публичный ключ туда и перезапусти этот скрипт чтобы отключить пароли."
fi

# fail2ban — банит за брутфорс
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban
info "fail2ban активен (sshd jail)"

# Unattended security upgrades
dpkg-reconfigure -plow unattended-upgrades
info "Unattended security upgrades включены"

# ─── 1. Swap 2GB ──────────────────────────────────────────────────────────────
step "Создание 2GB swap"
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -w vm.swappiness=10 >/dev/null
    grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
    info "Swap создан: 2GB"
else
    info "Swap уже есть"
fi

# ─── 2. Docker ────────────────────────────────────────────────────────────────
step "Установка Docker"
if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    info "Docker установлен"
else
    info "Docker уже установлен ($(docker --version))"
fi

# ─── 3. Certbot + Let's Encrypt ───────────────────────────────────────────────
step "Получение Let's Encrypt сертификата для ${DOMAIN}"
apt-get install -y -qq certbot

# Останавливаем что-нибудь, что могло занять 80 порт
docker stop messenger_nginx 2>/dev/null || true
fuser -k 80/tcp 2>/dev/null || true
sleep 2

if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    certbot certonly --standalone \
        -d "${DOMAIN}" \
        -d "www.${DOMAIN}" \
        --non-interactive --agree-tos \
        --email "${EMAIL}" \
        --no-eff-email \
        || certbot certonly --standalone -d "${DOMAIN}" --non-interactive --agree-tos --email "${EMAIL}" --no-eff-email
    info "Сертификат получен"
else
    info "Сертификат уже есть, пропускаем"
fi

# ─── 4. Копируем сертификаты в nginx/ssl ──────────────────────────────────────
step "Подключение SSL к nginx"
mkdir -p nginx/ssl
cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" nginx/ssl/cert.pem
cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem"   nginx/ssl/key.pem
info "Сертификаты в nginx/ssl/"

# ─── 5. Cron для авто-обновления сертификата ─────────────────────────────────
step "Настройка авто-обновления сертификата"
RENEW_HOOK="/usr/local/bin/messenger-cert-renew.sh"
cat > "${RENEW_HOOK}" <<EOF
#!/bin/bash
cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem $(pwd)/nginx/ssl/cert.pem
cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem   $(pwd)/nginx/ssl/key.pem
# nginx-unprivileged бежит под uid 101 — даём ему read к ключам
chown 101:101 $(pwd)/nginx/ssl/cert.pem $(pwd)/nginx/ssl/key.pem
chmod 644 $(pwd)/nginx/ssl/cert.pem
chmod 600 $(pwd)/nginx/ssl/key.pem
docker exec messenger_nginx nginx -s reload 2>/dev/null || true
EOF
chmod +x "${RENEW_HOOK}"
# Cron каждый день в 3:30 — certbot сам решит, нужно ли обновлять
( crontab -l 2>/dev/null | grep -v messenger-cert-renew; echo "30 3 * * * certbot renew --quiet --deploy-hook ${RENEW_HOOK}" ) | crontab -
info "Cron установлен (обновление каждый день в 3:30, сертификат продлевается за 30 дней до истечения)"

# ─── 6. .env ──────────────────────────────────────────────────────────────────
step "Конфигурация .env"
if [ ! -f .env ]; then
    cp .env.example .env
fi

JWT_A=$(openssl rand -hex 32)
JWT_R=$(openssl rand -hex 32)
sed -i "s|^SERVER_IP=.*|SERVER_IP=${DOMAIN}|"             .env
sed -i "s|^CLIENT_URL=.*|CLIENT_URL=https://${DOMAIN}|"   .env
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${JWT_A}|"  .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_R}|" .env
info ".env настроен: SERVER_IP=${DOMAIN}, JWT-секреты сгенерированы"

# ─── 7. Тюнинг Postgres под 2GB RAM ───────────────────────────────────────────
step "Тюнинг Postgres под 2GB RAM"
mkdir -p postgres
cat > postgres/postgres.conf <<'EOF'
# Постгрес тюнинг под VPS 2GB RAM.
shared_buffers = 256MB
effective_cache_size = 768MB
maintenance_work_mem = 64MB
work_mem = 4MB
max_connections = 50
wal_buffers = 8MB
random_page_cost = 1.1
effective_io_concurrency = 200
max_worker_processes = 2
max_parallel_workers_per_gather = 1
max_parallel_workers = 2
checkpoint_completion_target = 0.9
EOF
info "postgres/postgres.conf создан"

# ─── 8. Финальные права ──────────────────────────────────────────────────────
chmod +x entrypoint.sh coturn/entrypoint.sh deploy.sh 2>/dev/null || true

# ─── 9. Запуск ───────────────────────────────────────────────────────────────
step "Сборка и запуск контейнеров (5-10 минут на чистом сервере)"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up --build -d

step "Готово!"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Мессенджер развёрнут на ${DOMAIN}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Открой: ${YELLOW}https://${DOMAIN}${NC}"
echo ""
echo -e "  ${CYAN}Полезные команды:${NC}"
echo -e "  Логи всех:     docker compose logs -f"
echo -e "  Логи бэка:     docker logs -f messenger_backend"
echo -e "  Рестарт:       docker compose restart"
echo -e "  Стоп:          docker compose down"
echo -e "  Обновить код:  git pull && docker compose up --build -d"
echo ""
echo -e "  ${YELLOW}Если в браузере «Подождите ~30 сек»${NC} — Postgres ещё мигрирует базу при первом запуске."
echo -e "  Проверь: ${CYAN}docker logs messenger_backend${NC} — должно быть 'Starting server...'"
echo ""
