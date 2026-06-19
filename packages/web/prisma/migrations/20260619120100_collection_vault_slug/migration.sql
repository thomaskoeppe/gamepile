-- Issues #10 / #11 — custom, globally-unique URL slug for Vaults and Collections.
-- Nullable (opt-in); NULLs are distinct in Postgres so many rows may have no slug.

ALTER TABLE "Collection" ADD COLUMN "slug" TEXT;
ALTER TABLE "KeyVault" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");
CREATE UNIQUE INDEX "KeyVault_slug_key" ON "KeyVault"("slug");
