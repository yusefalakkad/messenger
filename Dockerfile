# ─── Stage 1: Build everything ───────────────────────────────────────────────
FROM node:20-alpine AS builder

ARG VITE_TURN_URL=""
ARG VITE_TURN_USER="turnuser"
ARG VITE_TURN_PASS="turnpass123"
ENV VITE_TURN_URL=$VITE_TURN_URL
ENV VITE_TURN_USER=$VITE_TURN_USER
ENV VITE_TURN_PASS=$VITE_TURN_PASS

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
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=builder /app/packages/backend/package.json ./packages/backend/package.json
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
