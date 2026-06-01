# Cloudflare Worker для обхода блокировки api.telegram.org

Если VPS, на котором крутится Dakka, не может достучаться до Telegram-API
(типично для RU/KZ/Беларусь хостингов), этот Worker используется как HTTP-прокси:

```
Dakka backend  ── X-Auth-Token: <secret> ──▶  Cloudflare Worker  ──▶  api.telegram.org
                  (https://dakka-tg.YOU.workers.dev/bot.../method)
```

## Один раз: задеплоить Worker

С локальной машины (Mac):

```bash
# 1. Установить wrangler (CLI Cloudflare Workers)
npm install -g wrangler

# 2. Войти в свой Cloudflare-аккаунт
wrangler login
# → откроется браузер, нажми Authorize

# 3. Зайти в эту папку
cd tools/cloudflare-tg-proxy

# 4. Положить секрет (придумай длинную случайную строку — её же положишь на VPS)
#    Подсказка: openssl rand -hex 32
wrangler secret put PROXY_AUTH_TOKEN
# → wrangler спросит value → вставь токен

# 5. Задеплоить
wrangler deploy
# → выведет URL: https://dakka-tg.<твой-account>.workers.dev
```

## На VPS: указать прокси в .env

```bash
nano /root/messenger/.env

# Добавь две строки:
TELEGRAM_API_BASE=https://dakka-tg.<твой-account>.workers.dev
TELEGRAM_API_PROXY_TOKEN=<тот же токен что положил в Worker через wrangler secret put>

# Сохрани, перезапусти backend
docker compose restart backend
docker logs messenger_backend --tail 20
```

В логах должно появиться `Telegram webhook set to ...` без ошибок.

## Проверка

```bash
# Сам прокси доступен?
curl -X POST https://dakka-tg.<your-account>.workers.dev/bot<TOKEN>/getMe \
  -H "X-Auth-Token: <тот же секрет>"
# → должен вернуть JSON с инфой о боте
```

## Безопасность

- Запросы без `X-Auth-Token` или с неправильным токеном → 401
- Прокси прозрачен: только форвардит, не логирует тела (которые содержат токен бота)
- Free tier Cloudflare: 100k запросов/день — на phone-auth хватит с большим запасом
- Если токен прокси утечёт — ротируй через `wrangler secret put PROXY_AUTH_TOKEN`
  и обнови в `.env` на VPS
