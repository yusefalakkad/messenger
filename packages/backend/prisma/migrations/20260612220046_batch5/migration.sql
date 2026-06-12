-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenVisibility" TEXT NOT NULL DEFAULT 'everyone',
ADD COLUMN     "readReceiptsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ChatMember" ADD COLUMN     "draft" TEXT,
ADD COLUMN     "draftUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "wallpaper" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "editHistory" JSONB;

