#!/bin/sh
set -e

# ─── Базовая конфигурация ──────────────────────────────────────────────────────
ARGS="-n \
  --listening-port=3478 \
  --fingerprint \
  --realm=${TURN_REALM:-dakka} \
  --log-file=stdout \
  --no-multicast-peers \
  --no-cli \
  --no-tcp-relay \
  --min-port=50000 \
  --max-port=50200"

# ─── Аутентификация ────────────────────────────────────────────────────────────
# Приоритет: REST-секрет (ephemeral HMAC-creds) > legacy static user/pass
if [ -n "$TURN_SECRET" ]; then
  ARGS="$ARGS --use-auth-secret --static-auth-secret=$TURN_SECRET"
  echo "[coturn] Using REST API auth (ephemeral credentials)"
else
  ARGS="$ARGS --lt-cred-mech --user=${TURN_USER:-turnuser}:${TURN_PASS:-turnpass123}"
  echo "[coturn] WARNING: using legacy static credentials. Set TURN_SECRET to enable REST auth."
fi

# ─── SECURITY: denied-peer-ip ──────────────────────────────────────────────────
# Без этого TURN можно использовать как SSRF-прокси к внутренним сервисам
# (postgres на 127.0.0.1, AWS metadata 169.254.169.254 и т.д.).
ARGS="$ARGS \
  --denied-peer-ip=0.0.0.0-0.255.255.255 \
  --denied-peer-ip=10.0.0.0-10.255.255.255 \
  --denied-peer-ip=100.64.0.0-100.127.255.255 \
  --denied-peer-ip=127.0.0.0-127.255.255.255 \
  --denied-peer-ip=169.254.0.0-169.254.255.255 \
  --denied-peer-ip=172.16.0.0-172.31.255.255 \
  --denied-peer-ip=192.0.0.0-192.0.0.255 \
  --denied-peer-ip=192.168.0.0-192.168.255.255 \
  --denied-peer-ip=198.18.0.0-198.19.255.255 \
  --denied-peer-ip=::1-::1 \
  --denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff \
  --denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff"

# ─── DoS-защита: лимиты пропускной способности ────────────────────────────────
# 2 Mbps / сессия — хватит для 720p video. 200 одновременных сессий total.
ARGS="$ARGS \
  --max-bps=2000000 \
  --total-quota=200 \
  --user-quota=50"

# ─── TLS (опционально) ─────────────────────────────────────────────────────────
# Если есть Let's Encrypt cert/pkey, поднимаем turns:// на 5349.
if [ -n "$TURN_TLS_CERT" ] && [ -n "$TURN_TLS_KEY" ] && [ -f "$TURN_TLS_CERT" ] && [ -f "$TURN_TLS_KEY" ]; then
  ARGS="$ARGS --tls-listening-port=5349 --cert=$TURN_TLS_CERT --pkey=$TURN_TLS_KEY"
  echo "[coturn] TLS enabled on 5349"
fi

# ─── External-IP для NAT ───────────────────────────────────────────────────────
if [ -n "$SERVER_IP" ]; then
    ARGS="$ARGS --external-ip=$SERVER_IP"
fi

exec turnserver $ARGS
