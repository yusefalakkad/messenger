-- Масштабируемый поиск: trigram (pg_trgm) GIN-индексы ускоряют ILIKE/contains
-- запросы (поиск по сообщениям, юзерам, чатам) — без них на объёме был seq scan.
-- Идемпотентно (IF NOT EXISTS) — безопасно при повторном деплое.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Текст сообщений: GET /chats/:id/messages/search + глобальный поиск.
CREATE INDEX IF NOT EXISTS "Message_content_trgm_idx"
  ON "Message" USING gin (content gin_trgm_ops);

-- Имя / @username пользователей.
CREATE INDEX IF NOT EXISTS "User_displayName_trgm_idx"
  ON "User" USING gin ("displayName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_username_trgm_idx"
  ON "User" USING gin ("username" gin_trgm_ops);

-- Название чата/канала.
CREATE INDEX IF NOT EXISTS "Chat_name_trgm_idx"
  ON "Chat" USING gin ("name" gin_trgm_ops);
