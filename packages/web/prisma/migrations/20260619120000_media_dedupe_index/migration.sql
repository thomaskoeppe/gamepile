-- Issue #94 — reduce DB write load from persistMedia.
-- Add (gameId, url) uniqueness so media writes can be diffed/idempotent, and an
-- index on gameId for the per-game read/delete path. Dedupe any pre-existing
-- duplicate rows before creating the unique indexes.

-- Drop duplicate screenshots, keeping one row per (gameId, url).
DELETE FROM "GameScreenshot" a
USING "GameScreenshot" b
WHERE a."gameId" = b."gameId"
  AND a."url" = b."url"
  AND a."id" > b."id";

-- Drop duplicate videos, keeping one row per (gameId, url).
DELETE FROM "GameVideo" a
USING "GameVideo" b
WHERE a."gameId" = b."gameId"
  AND a."url" = b."url"
  AND a."id" > b."id";

CREATE UNIQUE INDEX "GameScreenshot_gameId_url_key" ON "GameScreenshot"("gameId", "url");
CREATE INDEX "GameScreenshot_gameId_idx" ON "GameScreenshot"("gameId");

CREATE UNIQUE INDEX "GameVideo_gameId_url_key" ON "GameVideo"("gameId", "url");
CREATE INDEX "GameVideo_gameId_idx" ON "GameVideo"("gameId");
