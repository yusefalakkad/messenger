# ─── Stage 1: Build everything ───────────────────────────────────────────────
FROM node:20-alpine AS builder

# TURN credentials БОЛЬШЕ НЕ ЗАШИВАЮТСЯ в JS-бандл — пароль утёк бы через
# исходники. Клиент динамически забирает их с /api/webrtc/ice-servers
# (см. packages/web/src/lib/iceServers.ts).

WORKDIR /app
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci
COPY . .
RUN npx prisma generate --schema=packages/backend/prisma/schema.prisma
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/backend
RUN npm run build --workspace=packages/web

# ─── Stage 2: Backend runtime ────────────────────────────────────────────────
FROM node:20-alpine AS backend
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
# Копируем весь backend workspace целиком, включая его внутренние node_modules
# (workspaces иногда силосят пакеты в `packages/backend/node_modules` вместо корня).
COPY --from=builder /app/packages/backend ./packages/backend
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]

# ─── Stage 3: Nginx + built frontend ─────────────────────────────────────────
FROM nginx:stable-alpine AS nginx-frontend
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
