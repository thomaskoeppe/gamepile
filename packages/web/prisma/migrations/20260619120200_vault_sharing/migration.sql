-- Issue #9 — Vault Sharing.
-- Adds share configurations (passphrase-gated, with an optional re-wrapped vault
-- key), game whitelists, recipients (existing users or link claimers), one-time
-- share links, and a request/approval flow.

CREATE TYPE "VaultShareMode" AS ENUM ('DIRECT', 'REQUEST');
CREATE TYPE "VaultShareRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

ALTER TABLE "KeyVaultUser" ADD COLUMN "canShare" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "VaultShare" (
    "id" TEXT NOT NULL,
    "keyVaultId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" "VaultShareMode" NOT NULL DEFAULT 'DIRECT',
    "maxKeys" INTEGER,
    "authHash" TEXT,
    "authSalt" TEXT,
    "keySalt" TEXT,
    "encryptedVaultKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaultShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultShareGame" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "keyVaultGameId" TEXT NOT NULL,
    CONSTRAINT "VaultShareGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultShareRecipient" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" TEXT,
    "maxKeys" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultShareRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultShareLink" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "maxUses" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultShareLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultShareLinkUsage" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "usedById" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultShareLinkUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultShareRequest" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "keyVaultGameId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "VaultShareRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "VaultShareRequest_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "VaultShare_keyVaultId_idx" ON "VaultShare"("keyVaultId");
CREATE INDEX "VaultShare_createdById_idx" ON "VaultShare"("createdById");

CREATE UNIQUE INDEX "VaultShareGame_shareId_keyVaultGameId_key" ON "VaultShareGame"("shareId", "keyVaultGameId");
CREATE INDEX "VaultShareGame_shareId_idx" ON "VaultShareGame"("shareId");

CREATE UNIQUE INDEX "VaultShareRecipient_shareId_userId_key" ON "VaultShareRecipient"("shareId", "userId");
CREATE INDEX "VaultShareRecipient_shareId_idx" ON "VaultShareRecipient"("shareId");
CREATE INDEX "VaultShareRecipient_userId_idx" ON "VaultShareRecipient"("userId");

CREATE UNIQUE INDEX "VaultShareLink_token_key" ON "VaultShareLink"("token");
CREATE INDEX "VaultShareLink_shareId_idx" ON "VaultShareLink"("shareId");
CREATE INDEX "VaultShareLink_token_idx" ON "VaultShareLink"("token");

CREATE UNIQUE INDEX "VaultShareLinkUsage_linkId_usedById_key" ON "VaultShareLinkUsage"("linkId", "usedById");
CREATE INDEX "VaultShareLinkUsage_linkId_idx" ON "VaultShareLinkUsage"("linkId");

CREATE UNIQUE INDEX "VaultShareRequest_keyVaultGameId_requestedById_key" ON "VaultShareRequest"("keyVaultGameId", "requestedById");
CREATE INDEX "VaultShareRequest_shareId_idx" ON "VaultShareRequest"("shareId");
CREATE INDEX "VaultShareRequest_requestedById_idx" ON "VaultShareRequest"("requestedById");

-- Foreign keys
ALTER TABLE "VaultShare" ADD CONSTRAINT "VaultShare_keyVaultId_fkey" FOREIGN KEY ("keyVaultId") REFERENCES "KeyVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultShare" ADD CONSTRAINT "VaultShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VaultShareGame" ADD CONSTRAINT "VaultShareGame_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "VaultShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultShareGame" ADD CONSTRAINT "VaultShareGame_keyVaultGameId_fkey" FOREIGN KEY ("keyVaultGameId") REFERENCES "KeyVaultGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VaultShareRecipient" ADD CONSTRAINT "VaultShareRecipient_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "VaultShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultShareRecipient" ADD CONSTRAINT "VaultShareRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VaultShareLink" ADD CONSTRAINT "VaultShareLink_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "VaultShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VaultShareLinkUsage" ADD CONSTRAINT "VaultShareLinkUsage_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "VaultShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultShareLinkUsage" ADD CONSTRAINT "VaultShareLinkUsage_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VaultShareRequest" ADD CONSTRAINT "VaultShareRequest_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "VaultShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultShareRequest" ADD CONSTRAINT "VaultShareRequest_keyVaultGameId_fkey" FOREIGN KEY ("keyVaultGameId") REFERENCES "KeyVaultGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultShareRequest" ADD CONSTRAINT "VaultShareRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultShareRequest" ADD CONSTRAINT "VaultShareRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
