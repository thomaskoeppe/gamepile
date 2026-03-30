/*
  Warnings:

  - A unique constraint covering the columns `[keyVaultId,hashedKey]` on the table `KeyVaultGame` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AppSettingKey" AS ENUM ('ALLOW_USER_SIGNUP', 'ALLOW_USER_ACCOUNT_DELETION', 'ALLOW_INVITE_CODE_GENERATION', 'SESSION_TIMEOUT_SECONDS', 'VAULT_ALLOW_PASSWORD_CHANGE', 'VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD', 'VAULT_BLOCK_DURATION_SECONDS', 'VAULT_BLOCK_AFTER_ATTEMPTS', 'VAULT_DEFAULT_AUTH_TYPE', 'VAULT_AUTH_ALLOW_PASSWORD', 'VAULT_AUTH_ALLOW_PIN', 'VAULT_PASSWORD_MIN_LENGTH', 'VAULT_PASSWORD_MAX_LENGTH', 'VAULT_PIN_MIN_LENGTH', 'VAULT_PIN_MAX_LENGTH', 'ALLOW_VAULT_DELETION', 'DISABLE_VAULT_SHARING', 'ADMIN_CAN_DELETE_ANY_VAULT', 'ADMIN_CAN_DELETE_ANY_COLLECTION', 'ALLOW_PUBLIC_COLLECTIONS', 'ADMIN_CAN_CHANGE_RESOURCE_OWNER', 'MAX_VAULTS_PER_USER', 'MAX_COLLECTIONS_PER_USER');

-- DropIndex
DROP INDEX "Game_name_trgm_idx";

-- DropIndex
DROP INDEX "KeyVaultGame_keyVaultId_key_key";

-- AlterTable
ALTER TABLE "KeyVault" ADD COLUMN     "encryptedVaultKey" TEXT,
ADD COLUMN     "keySalt" TEXT,
ADD COLUMN     "recoveryEncryptedVaultKey" TEXT,
ADD COLUMN     "recoveryKeyHash" TEXT;

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" "AppSettingKey" NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "privacyAllowVaultInvites" BOOLEAN NOT NULL DEFAULT true,
    "privacyAllowCollectionInvites" BOOLEAN NOT NULL DEFAULT true,
    "privacyAllowProfileView" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT substring(md5(random()::text), 1, 8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCodeUsage" (
    "id" TEXT NOT NULL,
    "inviteCodeId" TEXT NOT NULL,
    "usedById" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCodeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- CreateIndex
CREATE INDEX "InviteCode_createdById_idx" ON "InviteCode"("createdById");

-- CreateIndex
CREATE INDEX "InviteCode_code_idx" ON "InviteCode"("code");

-- CreateIndex
CREATE INDEX "InviteCodeUsage_inviteCodeId_idx" ON "InviteCodeUsage"("inviteCodeId");

-- CreateIndex
CREATE INDEX "InviteCodeUsage_usedById_idx" ON "InviteCodeUsage"("usedById");

-- CreateIndex
CREATE UNIQUE INDEX "KeyVaultGame_keyVaultId_hashedKey_key" ON "KeyVaultGame"("keyVaultId", "hashedKey");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCodeUsage" ADD CONSTRAINT "InviteCodeUsage_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCodeUsage" ADD CONSTRAINT "InviteCodeUsage_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
