-- Chat pin / archive per-user state.
--   • pinnedAt   — момент закрепления чата у конкретного юзера (NULL = не закреплён)
--   • archivedAt — момент архивации чата у юзера (NULL = не в архиве)
-- mutedUntil уже существует.

ALTER TABLE "ChatMember"
  ADD COLUMN IF NOT EXISTS "pinnedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
