-- App-configurable library re-sync: how often the internal scheduler
-- re-imports each user's Steam library, and the cooldown between manual
-- user-triggered re-syncs. Values are seeded lazily from in-memory defaults;
-- do not INSERT rows using these enum values here — the deploy runner applies
-- each migration in a single transaction, and Postgres forbids using an enum
-- value added by ALTER TYPE within the same transaction.
ALTER TYPE "AppSettingKey" ADD VALUE 'LIBRARY_AUTO_RESYNC_INTERVAL_HOURS';
ALTER TYPE "AppSettingKey" ADD VALUE 'LIBRARY_MANUAL_RESYNC_COOLDOWN_MINUTES';
