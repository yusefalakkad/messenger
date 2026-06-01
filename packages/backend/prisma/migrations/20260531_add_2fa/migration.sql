-- Add 2FA (TOTP) fields to User
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "twoFactorRecovery" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
