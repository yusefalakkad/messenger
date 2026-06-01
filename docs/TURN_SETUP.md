# TURN-сервер (звонки за NAT)

## Что это

WebRTC напрямую соединяет двух пользователей peer-to-peer. Но если оба за роутером с **симметричным NAT** (домашний WiFi, мобильная сеть, корпоративная сеть), прямой канал не установится — нужен **TURN** (Traversal Using Relays around NAT) — публичный сервер, который проксирует медиапоток.

Без TURN ~30% звонков в реальных сетях не установятся.

## Что уже сделано

В проекте развёрнут **coturn** (стандарт-де-факто TURN сервер) через docker-compose:

```yaml
# docker-compose.yml
coturn:
  image: coturn/coturn:latest
  network_mode: host
  ports:
    - 3478:3478/udp
    - 3478:3478/tcp
    - 50000-50200:50000-50200/udp  # media relay диапазон
```

Конфиг — в [coturn/entrypoint.sh](../coturn/entrypoint.sh).

## Настройка (один раз)

### 1. ENV переменные

В `.env`:

```env
TURN_USER=turnuser
TURN_PASS=<минимум 16 случайных символов>
TURN_REALM=dakka
# Опционально: домен по которому TURN доступен снаружи.
# Если пусто — берётся SERVER_IP.
TURN_DOMAIN=akkdmsg.online
```

⚠️ Поменяй TURN_PASS обязательно — открытый TURN-сервер с дефолтным паролем == бесплатный прокси для любого в интернете (на стоимость **твоего** трафика).

### 2. Открыть порты на хостинге

Если у тебя cloud provider (DigitalOcean / Hetzner / AWS), убедись что в firewall открыты:

- **3478/udp** — основной TURN-порт
- **3478/tcp** — fallback для сетей которые блочат UDP
- **50000-50200/udp** — диапазон media-relay (через какие порты coturn проксирует звуковые/видео потоки)

### 3. Перезапустить

```bash
docker compose restart coturn
# или
docker compose up -d --build coturn
```

В логах должно быть:
```
turnserver: Listener on UDP port 3478
turnserver: Listener on TCP port 3478
turnserver: Relay ports: 50000-50200
```

## Как клиент использует

iOS и веб-клиент **не зашивают** TURN credentials в код (это утечёт пароль через бинарь приложения).

Вместо этого они запрашивают **`GET /api/webrtc/ice-servers`** перед каждым звонком. Бэкенд читает `TURN_USER/TURN_PASS/TURN_DOMAIN` из ENV и возвращает:

```json
{
  "iceServers": [
    {
      "urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
    },
    {
      "urls": [
        "turn:akkdmsg.online:3478?transport=udp",
        "turn:akkdmsg.online:3478?transport=tcp"
      ],
      "username": "turnuser",
      "credential": "<пароль>"
    }
  ]
}
```

Этот массив передаётся в `RTCPeerConnectionFactory.peerConnection(with:...)` как `iceServers`.

### iOS:

- [ICEServerService.swift](../apps/ios/dakka/Core/Call/ICEServerService.swift) — fetch + fallback на STUN
- [CallManager.swift](../apps/ios/dakka/Core/Call/CallManager.swift) — префетчит при init, кэширует
- [WebRTCManager.swift](../apps/ios/dakka/Core/Call/WebRTCManager.swift) — принимает серверы как init-параметр

### Веб (Capacitor):

`packages/web` уже читает `VITE_TURN_USER/PASS` из env при сборке (см. `docker-compose.yml`), но лучше переключить на `/api/webrtc/ice-servers`. (TODO в отдельной сессии.)

## Проверка работы

### 1. Логи coturn

```bash
docker compose logs -f coturn
```

При успешном звонке через relay увидишь:
```
session 001000000000000001: new, realm=<dakka>, username=<turnuser>
session 001000000000000001: allocated relay session
session 001000000000000001: peer 198.51.100.1:50333
```

### 2. Stats API

В iOS `RTCPeerConnection.statistics(completionHandler:)` есть `IceCandidatePairStats.currentRoundTripTime` — если RTT внезапно > 100мс при близком пинге, скорее всего идёт через relay (что норма для NAT'a).

### 3. WebRTC Internals (Chrome)

В Chrome DevTools → chrome://webrtc-internals можно смотреть выбранную ICE-пару — там видно, через `host`, `srflx` (STUN) или `relay` (TURN) идёт соединение.

## Затраты

TURN-relay проксирует ВЕСЬ медиа-трафик звонка через твой сервер.

Грубые цифры:
- Аудио звонок: ~50 kbps в каждую сторону → 25 GB/час
- Видео звонок 720p: ~1 Mbps в каждую сторону → 1.8 GB/час

Если у тебя 1000 пользователей и 10% звонков идёт через relay, при средней длительности 5 мин:
- Аудио: ~21 GB/день
- Видео: ~750 GB/день

Большинство VPS-провайдеров включают 1-10 TB трафика в тариф. Hetzner: до 20 TB бесплатно на VPS. Этого хватит на тысячи звонков в день.

## Что осталось (опционально)

- **Short-lived credentials** через `--use-auth-secret` + HMAC — пароль становится временным (15 мин), безопаснее чем static. Реализуется в `/api/webrtc/ice-servers` через `crypto.createHmac`. Полезно если приложение публичное и любой может зарегистрироваться.
- **TLS-турн (TURNS)** на порту 5349 — для сетей которые проксируют только HTTPS. Требует валидный SSL.
- **Multiple regions** — деплой нескольких coturn по миру, бэкенд возвращает ближайший по geo.
