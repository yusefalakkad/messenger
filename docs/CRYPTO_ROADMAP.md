# Криптография: что есть и куда расти

## Текущая модель

E2E-шифрование на NaCl Box (X25519 + XSalsa20-Poly1305).

| Уровень | Реализация |
|---|---|
| Identity key | Один статический X25519-keypair на пользователя |
| Сообщение | NaCl box между моим приватным и публичным ключом получателя |
| Хранение приватного ключа | localStorage, AES-GCM шифрование под паролем (PBKDF2 250k), плейнтекст только в sessionStorage |
| Группы | Симметричный session key, зашифрованный публичным ключом каждого участника при создании чата |
| Сверка ключей | Safety numbers (60-значный детерминированный отпечаток, как в Signal) |
| 2FA | TOTP + 10 одноразовых recovery-кодов |

## Чего **нет**

### 1. Perfect Forward Secrecy (PFS)
Если когда-нибудь утечёт приватный ключ — расшифруют **всю** прошлую переписку.

### 2. Post-Compromise Security (PCS)
И всю будущую тоже, пока юзер не сгенерирует новый ключ.

### 3. Out-of-order ratcheting
Сообщения должны прийти в порядке отправки. На практике это работает (Socket.io ordering), но не гарантировано на крипто-уровне.

### 4. Multi-device
Один ключ на устройство. Зайти с двух девайсов одним аккаунтом = две разные "криптоличности".

---

## Почему я **не** имплементил Double Ratchet прямо сейчас

Honest answer: **я не криптограф**. Свой Double Ratchet за вечер — это не «security feature», это **бэкдор, который я неосознанно встрою**. Известные ошибки в самописных реализациях:

- Утечка ключевого материала через побочные каналы (timing, GC)
- Неправильная обработка skipped messages → DoS или потеря сообщений
- Неправильный HKDF info → совпадение ключей в разных контекстах
- Забытое key zeroization → ключи в дампах памяти
- Неправильное хранение state → атаки на rollback

Все эти грабли уже разложены, обойдены и заасфальтированы в библиотеке Signal. Использовать их — единственно правильный путь.

---

## Путь к интеграции через `libsignal-protocol-typescript`

Это TypeScript-порт оригинальной библиотеки Signal от Privacy Research Group:
https://github.com/privacyresearchgroup/libsignal-protocol-typescript

Лицензия: GPL-3.0 (важно для коммерческого использования — посмотри лицензию).

### Шаг 1: Схема БД

Добавить таблицы для prekey bundle и сессий:

```prisma
model PrekeyBundle {
  userId           String   @id
  registrationId   Int
  identityKey      String   // long-term public, base64
  signedPrekey     String   // SignedPreKey base64
  signedPrekeyId   Int
  signedPrekeySig  String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model OneTimePrekey {
  id     String @id @default(cuid())
  userId String
  keyId  Int
  key    String // public, base64
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@unique([userId, keyId])
}
```

### Шаг 2: Endpoints

```
POST /keys/bundle          — клиент загружает свой PrekeyBundle + порцию one-time prekeys
POST /keys/replenish       — клиент дозагружает one-time prekeys когда сервер их раздал
GET  /keys/bundle/:userId  — получить bundle собеседника (one-time prekey ИЗВЛЕКАЕТСЯ — больше не будет отдан)
```

### Шаг 3: Frontend

Заменить `packages/web/src/lib/e2e.ts` и `lib/crypto.ts` на обёртку над libsignal:

```typescript
import { SignalProtocolStore, SessionBuilder, SessionCipher } from '@privacyresearch/libsignal-protocol-typescript';

// Store: IndexedDB persistence (а не localStorage — слишком много state)
// SessionBuilder: при первом сообщении в чат
// SessionCipher: для encrypt/decrypt каждого сообщения
```

State хранится в **IndexedDB** (libsignal требует структурированное хранилище — десятки таблиц для skipped keys, sessions, identities).

### Шаг 4: Регистрация

При регистрации клиент:
1. Генерит identity keypair
2. Генерит signed prekey + подпись
3. Генерит 100 one-time prekeys
4. Загружает всё на сервер через `/keys/bundle`

### Шаг 5: Отправка первого сообщения

Клиент:
1. Тянет `/keys/bundle/:peerId` (сервер выдаёт + забирает one-time prekey)
2. `SessionBuilder.processPreKey(bundle)` создаёт сессию
3. `SessionCipher.encrypt(plaintext)` → отправляем

### Шаг 6: Получение

`SessionCipher.decrypt(ciphertext)` — автоматически делает DH ratchet + symmetric ratchet под капотом.

### Шаг 7: Replenish

Клиент периодически проверяет сколько у него одноразовых ключей на сервере осталось (через отдельный endpoint), при <20 — догенерирует и заливает.

### Шаг 8: Группы

Для групп — отдельный протокол **Sender Keys** (не Double Ratchet, но из той же экосистемы). Поддерживается отдельной частью libsignal.

---

## Объём работы

- Schema + миграции: 1 день
- Backend endpoints: 2 дня
- Frontend integration (libsignal + IndexedDB store): 3-5 дней
- Миграция существующих чатов (старый E2E → новый): 2 дня
- Тестирование, отладка key exchange edge cases: 3-5 дней

**Итого: 11-16 рабочих дней** одного человека, который уже работал с libsignal.

---

## Альтернатива поменьше: Signal-style Triple DH без полного Ratchet

Если не нужен полный Double Ratchet но хочется добавить PFS, можно:

1. Эфемерный X25519-keypair на каждое сообщение от отправителя
2. Shared secret = `HKDF(DH(my_ephemeral, peer_identity) || DH(my_identity, peer_identity))`
3. Зашифровать AES-GCM
4. Отправить вместе с публичной частью эфемерного ключа

Это **forward secrecy** (новый ephemeral на каждое сообщение → старые сообщения нельзя расшифровать после компрометации identity).

Это **не** дает post-compromise security и не имеет ratcheting, но проще в реализации (~2-3 дня).

Если интересен этот промежуточный вариант — скажи, опишу детально.

---

## Что делать пока DR нет

1. **Регулярно ротировать identity key** (раз в полгода — стереть, перевыпустить). Старые сообщения станут нечитаемыми везде кроме истории на устройстве.
2. **Verify safety numbers лично** при каждой важной переписке. Это убирает риск MITM от сервера.
3. **Не входить с публичных компьютеров** — sessionStorage сохранит plaintext-ключ до закрытия вкладки.
4. **Использовать 2FA** — даже если пароль украдут, не зайдут.
