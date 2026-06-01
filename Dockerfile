# ─── Stage 1: Build everything ───────────────────────────────────────────────
FROM node:20-alpine AS builder

# TURN credentials БОЛЬШЕ НЕ ЗАШИВАЮТСЯ в JS-бандл — пароль утёк бы через
# исходники. Клиент динамически забирает их с /api/webrtc/ice-servers
# (см. packages/web/src/lib/iceServers.ts).

# Build-tools для нативных модулей (argon2, sharp и др.). Нужны как fallback
# когда node-pre-gyp не может скачать prebuilt-бинарник с GitHub Releases
# (504 Gateway Timeout, региональная блокировка, и т.п.). На runtime-stage
# эти пакеты НЕ копируются — там уже готовый .node-файл в node_modules.
RUN apk add --no-cache python3 make g++ \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/
# --network-timeout повышает таймаут на скачивание prebuilt-бинарников
RUN npm ci --fetch-timeout=600000 --fetch-retries=5
COPY . .
RUN npx prisma generate --schema=packages/backend/prisma/schema.prisma
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/backend
RUN npm run build --workspace=packages/web

# ─── Stage 2: Backend runtime ────────────────────────────────────────────────
FROM node:20-alpine AS backend
RUN apk add --no-cache openssl tini
# SECURITY: non-root юзер. Без этого баг в Express → root в контейнере.
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/packages/backend ./packages/backend
COPY --from=builder --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=app:app entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# Winston file-transport требует writable logs/. Под non-root юзером mkdir
# в /app не работает, поэтому создаём папку заранее с нужным владельцем.
RUN mkdir -p /app/logs && chown -R app:app /app/logs
USER app
EXPOSE 4000
# tini = правильная обработка SIGTERM (graceful shutdown в node)
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]

# ─── Stage 3: Nginx + built frontend ─────────────────────────────────────────
# nginxinc/nginx-unprivileged — стандартный non-root образ, listen 8080 (не 80).
# В docker-compose маппинг "80:8080" / "443:8443" обрабатывает host-side.
FROM nginxinc/nginx-unprivileged:stable-alpine AS nginx-frontend
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080 8443
CMD ["nginx", "-g", "daemon off;"]
