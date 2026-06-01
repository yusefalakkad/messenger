-- Связка номер телефона ↔ telegram chat_id для отправки OTP через бот

CREATE TABLE "TelegramAuthLink" (
  "id"         TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "chatId"     BIGINT NOT NULL,
  "username"   TEXT,
  "linkedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAuthLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramAuthLink_phone_key" ON "TelegramAuthLink"("phone");
CREATE INDEX        "TelegramAuthLink_chatId_idx" ON "TelegramAuthLink"("chatId");
