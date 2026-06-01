-- Phone-OTP auth migration:
--  • passwordHash, username, displayName, publicKey  → NULLABLE (заполняются при complete-profile)
--  • phoneVerified Boolean DEFAULT FALSE             → новый флаг подтверждения номера

ALTER TABLE "User"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ALTER COLUMN "username"     DROP NOT NULL,
  ALTER COLUMN "displayName"  DROP NOT NULL,
  ALTER COLUMN "publicKey"    DROP NOT NULL;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT FALSE;

-- Старые юзеры с passwordHash считаются phone-неверифицированными (если phone задан).
-- При следующем входе им потребуется привязать/подтвердить номер.
