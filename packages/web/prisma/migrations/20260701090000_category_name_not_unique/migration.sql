-- Steam's GetStoreCategories returns categories whose display names are not
-- globally unique (and a display name can move between category ids), which
-- made the SYNC_STEAM_CATEGORIES upsert-by-categoryId crash with a unique
-- violation on "name". The natural key is Steam's category id; the display
-- name is presentation data only (Tag.name has never been unique either).
DROP INDEX "Category_name_key";
