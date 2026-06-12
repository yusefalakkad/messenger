-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "slowModeSeconds" INTEGER;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "viewOnce" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "viewedAt" TIMESTAMP(3);

