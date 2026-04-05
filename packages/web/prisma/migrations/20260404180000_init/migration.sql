-- GamePile — Combined initial migration
-- Merges: init + v2_init + enhanced search vector (categories, tags)

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==========================================================================
-- Enums
-- ==========================================================================
CREATE TYPE "Platform" AS ENUM ('WINDOWS', 'LINUX', 'MAC');
CREATE TYPE "CollectionVisibility" AS ENUM ('PRIVATE', 'PUBLIC');
CREATE TYPE "GameType" AS ENUM ('GAME', 'DLC', 'DEMO', 'MOD', 'ADVERTISING', 'UNKNOWN');
CREATE TYPE "KeyVaultAuthType" AS ENUM ('NONE', 'PIN', 'PASSWORD');
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "JobType" AS ENUM ('SYNC_STEAM_GAMES', 'IMPORT_USER_LIBRARY', 'IMPORT_USER_ACHIEVEMENTS', 'REFRESH_GAME_DETAILS', 'INTERNAL_SCHEDULED_TASK', 'SYNC_STEAM_TAGS', 'SYNC_STEAM_CATEGORIES');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELED');
CREATE TYPE "AppSettingKey" AS ENUM ('ALLOW_USER_SIGNUP', 'ALLOW_USER_ACCOUNT_DELETION', 'ALLOW_INVITE_CODE_GENERATION', 'SESSION_TIMEOUT_SECONDS', 'VAULT_ALLOW_PASSWORD_CHANGE', 'VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD', 'VAULT_BLOCK_DURATION_SECONDS', 'VAULT_BLOCK_AFTER_ATTEMPTS', 'VAULT_DEFAULT_AUTH_TYPE', 'VAULT_AUTH_ALLOW_PASSWORD', 'VAULT_AUTH_ALLOW_PIN', 'VAULT_PASSWORD_MIN_LENGTH', 'VAULT_PASSWORD_MAX_LENGTH', 'VAULT_PIN_MIN_LENGTH', 'VAULT_PIN_MAX_LENGTH', 'ALLOW_VAULT_DELETION', 'DISABLE_VAULT_SHARING', 'ADMIN_CAN_DELETE_ANY_VAULT', 'ADMIN_CAN_DELETE_ANY_COLLECTION', 'ALLOW_PUBLIC_COLLECTIONS', 'ADMIN_CAN_CHANGE_RESOURCE_OWNER', 'MAX_VAULTS_PER_USER', 'MAX_COLLECTIONS_PER_USER', 'UI_GAME_LIBRARY_PRERENDERED_ROWS');

-- ==========================================================================
-- Tables
-- ==========================================================================

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "profileUrl" TEXT NOT NULL,
    "lastLogin" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Game" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "fullDescription" TEXT,
    "developers" TEXT[],
    "publishers" TEXT[],
    "franchises" TEXT[],
    "releaseDate" TIMESTAMP(3),
    "headerImageUrl" TEXT,
    "capsuleImageUrl" TEXT,
    "libraryCapsuleUrl" TEXT,
    "libraryHeroUrl" TEXT,
    "heroCapsuleUrl" TEXT,
    "reviewScore" INTEGER,
    "reviewPercentage" INTEGER,
    "reviewCount" INTEGER,
    "reviewScoreLabel" TEXT,
    "isEarlyAccess" BOOLEAN NOT NULL DEFAULT false,
    "steamDeckCompat" INTEGER,
    "platforms" "Platform"[],
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "detailsFetchedAt" TIMESTAMP(3),
    "steamLastModified" INTEGER,
    "type" "GameType" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search_vector" tsvector,
    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "tagId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "icongray" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "gameId" UUID NOT NULL,
    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" UUID NOT NULL,
    "playtime" INTEGER NOT NULL DEFAULT 0,
    "playtime2Weeks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserGameAchievement" (
    "id" TEXT NOT NULL,
    "userGameId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGameAchievement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CollectionVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionUser" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canModify" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CollectionUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionGame" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "gameId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "CollectionGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KeyVault" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authType" "KeyVaultAuthType" NOT NULL,
    "recoveryEncryptedVaultKey" TEXT,
    "keySalt" TEXT,
    "recoveryKeyHash" TEXT,
    "encryptedVaultKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "authHash" TEXT,
    "authSalt" TEXT,
    CONSTRAINT "KeyVault_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KeyVaultUser" (
    "id" TEXT NOT NULL,
    "keyVaultId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canRedeem" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "KeyVaultUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KeyVaultGame" (
    "id" TEXT NOT NULL,
    "keyVaultId" TEXT NOT NULL,
    "gameId" UUID,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" TEXT,
    CONSTRAINT "KeyVaultGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "allItemsQueued" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "claimedBy" TEXT,
    "userId" TEXT,
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FailedChildJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "appId" INTEGER NOT NULL,
    "gameId" UUID,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FailedChildJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameScreenshot" (
    "id" TEXT NOT NULL,
    "gameId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameScreenshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameVideo" (
    "id" TEXT NOT NULL,
    "gameId" UUID NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameVideo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" "AppSettingKey" NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "privacyAllowVaultInvites" BOOLEAN NOT NULL DEFAULT true,
    "privacyAllowCollectionInvites" BOOLEAN NOT NULL DEFAULT true,
    "privacyAllowProfileView" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT substring(md5(random()::text), 1, 8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteCodeUsage" (
    "id" TEXT NOT NULL,
    "inviteCodeId" TEXT NOT NULL,
    "usedById" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteCodeUsage_pkey" PRIMARY KEY ("id")
);

-- ==========================================================================
-- Implicit many-to-many join tables
-- ==========================================================================

CREATE TABLE "_GameToCategories" (
    "A" TEXT NOT NULL,
    "B" UUID NOT NULL,
    CONSTRAINT "_GameToCategories_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE TABLE "_GameToTags" (
    "A" UUID NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_GameToTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- ==========================================================================
-- Full-text search trigger on Game
-- ==========================================================================
-- Weights:
--   A = name
--   B = shortDescription, fullDescription
--   C = developers, publishers, franchises
--   D = categories, tags (looked up from join tables)
--
-- A BEFORE INSERT/UPDATE trigger on Game builds the vector from both direct
-- columns and relation data.  Separate AFTER triggers on the three join
-- tables "touch" the parent Game row so the vector is refreshed when
-- relations change independently of a Game UPDATE.
-- ==========================================================================

CREATE OR REPLACE FUNCTION game_search_vector_update()
RETURNS trigger AS $$
DECLARE
    cat_text  TEXT;
    tag_text  TEXT;
BEGIN
    -- Look up related category / tag names
    SELECT string_agg(c."name", ' ') INTO cat_text
      FROM "Category" c
      JOIN "_GameToCategories" gc ON gc."A" = c."id"
     WHERE gc."B" = NEW."id";

    SELECT string_agg(t."name", ' ') INTO tag_text
      FROM "Tag" t
      JOIN "_GameToTags" gt ON gt."B" = t."id"
     WHERE gt."A" = NEW."id";

    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW."name", '')),                               'A') ||
        setweight(to_tsvector('english', coalesce(NEW."shortDescription", '')),                   'B') ||
        setweight(to_tsvector('english', coalesce(NEW."fullDescription", '')),                    'B') ||
        setweight(to_tsvector('english', coalesce(array_to_string(NEW."developers", ' '), '')),   'C') ||
        setweight(to_tsvector('english', coalesce(array_to_string(NEW."publishers", ' '), '')),   'C') ||
        setweight(to_tsvector('english', coalesce(array_to_string(NEW."franchises", ' '), '')),   'C') ||
        setweight(to_tsvector('english', coalesce(cat_text, '')),                                 'D') ||
        setweight(to_tsvector('english', coalesce(tag_text, '')),                                 'D');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_search_vector_trigger
    BEFORE INSERT OR UPDATE ON "Game"
    FOR EACH ROW
    EXECUTE FUNCTION game_search_vector_update();

-- ---------------------------------------------------------------------------
-- Relation-change triggers: when categories/tags are linked or
-- unlinked, touch the parent Game so game_search_vector_trigger rebuilds
-- the vector.  Uses a no-op UPDATE ("name" = "name") to avoid side-effects.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION game_relation_search_update()
RETURNS trigger AS $$
DECLARE
    gid UUID;
BEGIN
    -- Determine the Game id from the join row that was inserted or deleted.
    --   _GameToCategories: "A" = Category.id, "B" = Game.id
    --   _GameToTags:       "A" = Game.id,     "B" = Tag.id
    IF TG_TABLE_NAME = '_GameToCategories' THEN
        gid := COALESCE(NEW."B", OLD."B");
    ELSE
        gid := COALESCE(NEW."A", OLD."A");
    END IF;

    -- No-op update that fires the BEFORE UPDATE trigger on Game
    UPDATE "Game" SET "name" = "name" WHERE "id" = gid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_categories_search_trigger
    AFTER INSERT OR DELETE ON "_GameToCategories"
    FOR EACH ROW EXECUTE FUNCTION game_relation_search_update();

CREATE TRIGGER game_tags_search_trigger
    AFTER INSERT OR DELETE ON "_GameToTags"
    FOR EACH ROW EXECUTE FUNCTION game_relation_search_update();

-- ==========================================================================
-- Backfill search_vector for all existing rows
-- ==========================================================================

UPDATE "Game" g
SET "search_vector" =
    setweight(to_tsvector('english', coalesce(g."name", '')),                               'A') ||
    setweight(to_tsvector('english', coalesce(g."shortDescription", '')),                   'B') ||
    setweight(to_tsvector('english', coalesce(g."fullDescription", '')),                    'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(g."developers", ' '), '')),   'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(g."publishers", ' '), '')),   'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(g."franchises", ' '), '')),   'C') ||
    setweight(to_tsvector('english', coalesce((
        SELECT string_agg(c."name", ' ')
          FROM "Category" c
          JOIN "_GameToCategories" gc ON gc."A" = c."id"
         WHERE gc."B" = g."id"
    ), '')), 'D') ||
    setweight(to_tsvector('english', coalesce((
        SELECT string_agg(t."name", ' ')
          FROM "Tag" t
          JOIN "_GameToTags" gt ON gt."B" = t."id"
         WHERE gt."A" = g."id"
    ), '')), 'D');

-- ==========================================================================
-- Indexes
-- ==========================================================================

-- User
CREATE UNIQUE INDEX "User_steamId_key" ON "User"("steamId");
CREATE INDEX "User_steamId_idx" ON "User"("steamId");

-- Session
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_token_idx" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- Game
CREATE UNIQUE INDEX "Game_appId_key" ON "Game"("appId");
CREATE INDEX "Game_name_idx" ON "Game"("name");
CREATE INDEX "Game_appId_idx" ON "Game"("appId");
CREATE INDEX "Game_search_vector_idx" ON "Game" USING GIN ("search_vector");

-- Category / Tag
CREATE UNIQUE INDEX "Category_categoryId_key" ON "Category"("categoryId");
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Tag_tagId_key" ON "Tag"("tagId");
CREATE INDEX "Tag_tagId_idx" ON "Tag"("tagId");

-- Achievement
CREATE UNIQUE INDEX "Achievement_gameId_name_key" ON "Achievement"("gameId", "name");

-- UserGame
CREATE UNIQUE INDEX "UserGame_userId_gameId_key" ON "UserGame"("userId", "gameId");

-- UserGameAchievement
CREATE UNIQUE INDEX "UserGameAchievement_userGameId_achievementId_key" ON "UserGameAchievement"("userGameId", "achievementId");

-- Collection
CREATE INDEX "Collection_createdById_idx" ON "Collection"("createdById");
CREATE INDEX "Collection_name_idx" ON "Collection"("name");
CREATE UNIQUE INDEX "CollectionUser_collectionId_userId_key" ON "CollectionUser"("collectionId", "userId");
CREATE UNIQUE INDEX "CollectionGame_collectionId_gameId_key" ON "CollectionGame"("collectionId", "gameId");

-- KeyVault
CREATE UNIQUE INDEX "KeyVault_createdById_name_key" ON "KeyVault"("createdById", "name");
CREATE INDEX "KeyVault_createdById_idx" ON "KeyVault"("createdById");
CREATE UNIQUE INDEX "KeyVaultUser_keyVaultId_userId_key" ON "KeyVaultUser"("keyVaultId", "userId");
CREATE UNIQUE INDEX "KeyVaultGame_keyVaultId_hashedKey_key" ON "KeyVaultGame"("keyVaultId", "hashedKey");

-- Job
CREATE INDEX "JobLog_jobId_idx" ON "JobLog"("jobId");
CREATE INDEX "Job_status_idx" ON "Job"("status");
CREATE INDEX "Job_claimedBy_idx" ON "Job"("claimedBy");
CREATE INDEX "Job_userId_idx" ON "Job"("userId");
CREATE INDEX "Job_type_idx" ON "Job"("type");
CREATE INDEX "FailedChildJob_jobId_idx" ON "FailedChildJob"("jobId");
CREATE INDEX "FailedChildJob_appId_idx" ON "FailedChildJob"("appId");

-- Join tables
CREATE INDEX "_GameToCategories_B_index" ON "_GameToCategories"("B");
CREATE INDEX "_GameToTags_B_index" ON "_GameToTags"("B");

-- AppSetting
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- UserSettings
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- InviteCode
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");
CREATE INDEX "InviteCode_createdById_idx" ON "InviteCode"("createdById");
CREATE INDEX "InviteCode_code_idx" ON "InviteCode"("code");
CREATE INDEX "InviteCodeUsage_inviteCodeId_idx" ON "InviteCodeUsage"("inviteCodeId");
CREATE INDEX "InviteCodeUsage_usedById_idx" ON "InviteCodeUsage"("usedById");

-- ==========================================================================
-- Foreign keys
-- ==========================================================================

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserGame" ADD CONSTRAINT "UserGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGame" ADD CONSTRAINT "UserGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserGameAchievement" ADD CONSTRAINT "UserGameAchievement_userGameId_fkey" FOREIGN KEY ("userGameId") REFERENCES "UserGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGameAchievement" ADD CONSTRAINT "UserGameAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Collection" ADD CONSTRAINT "Collection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionUser" ADD CONSTRAINT "CollectionUser_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionUser" ADD CONSTRAINT "CollectionUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionUser" ADD CONSTRAINT "CollectionUser_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionGame" ADD CONSTRAINT "CollectionGame_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionGame" ADD CONSTRAINT "CollectionGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionGame" ADD CONSTRAINT "CollectionGame_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KeyVault" ADD CONSTRAINT "KeyVault_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KeyVaultUser" ADD CONSTRAINT "KeyVaultUser_keyVaultId_fkey" FOREIGN KEY ("keyVaultId") REFERENCES "KeyVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeyVaultUser" ADD CONSTRAINT "KeyVaultUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeyVaultUser" ADD CONSTRAINT "KeyVaultUser_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KeyVaultGame" ADD CONSTRAINT "KeyVaultGame_keyVaultId_fkey" FOREIGN KEY ("keyVaultId") REFERENCES "KeyVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeyVaultGame" ADD CONSTRAINT "KeyVaultGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeyVaultGame" ADD CONSTRAINT "KeyVaultGame_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeyVaultGame" ADD CONSTRAINT "KeyVaultGame_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FailedChildJob" ADD CONSTRAINT "FailedChildJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameScreenshot" ADD CONSTRAINT "GameScreenshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GameToCategories" ADD CONSTRAINT "_GameToCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_GameToCategories" ADD CONSTRAINT "_GameToCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GameToTags" ADD CONSTRAINT "_GameToTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_GameToTags" ADD CONSTRAINT "_GameToTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteCodeUsage" ADD CONSTRAINT "InviteCodeUsage_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteCodeUsage" ADD CONSTRAINT "InviteCodeUsage_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

