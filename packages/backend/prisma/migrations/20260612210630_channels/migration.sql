-- AlterEnum
ALTER TYPE "ChatType" ADD VALUE 'channel';

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "inviteCode" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Chat_username_key" ON "Chat"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_inviteCode_key" ON "Chat"("inviteCode");

