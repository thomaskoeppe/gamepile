-- Tracks when a game's achievement schema was last fetched from Steam, so the
-- achievements import can distinguish "fetched, has zero achievements" from
-- "never fetched" and skip pointless re-fetches.
ALTER TABLE "Game" ADD COLUMN "achievementsFetchedAt" TIMESTAMP(3);
