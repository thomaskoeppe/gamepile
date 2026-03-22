# Database Schema — README

This document describes the PostgreSQL database schema defined in `schema.prisma`. The project uses **Prisma ORM** with two generated clients: one for the web package and one for the worker package.

---

## Overview

- **User authentication** via Steam OAuth with session management
- **Game library** tracking playtime, achievements, and metadata synced from Steam
- **Collections** — curated, shareable game lists with visibility controls
- **Key Vaults** — secure storage for game keys with PIN/password auth and per-user permissions
- **Invite codes** for controlled user registration
- **Background jobs** for async Steam data sync with logging and failure tracking
- **Admin settings** for platform-wide feature flags

---

## ER Diagram

[![](https://mermaid.ink/img/pako:eNqlV01z2zYQ_Sscnh2PGktRrJuijFsnTccTx-5M4x4gYkWhBgkOAMpmZf33LiASJPghyfWFIhcPuw-7DwtoG0aCQjgLQX5mJJYkeUiD4E6BDLbmLQiUliyNA0aDm6-eRWkgyTUN7nxzjnNTkoBnJBuiibyTfG81_r8LDoHEhzHtzOMWlGIiPRrYRMC4V75Vi0dIHZnPRMMPlkAAzxmToObad5rNKUWzcsENpVvQGkfVaxksheBBJtmGRMWcc_F0T3Kur9MN06AGIAvBOUQa13sYdyPFinG4Z_DkuP6K6a045jnSazBkqQ5IlnXrUtfkhhO9EjL5-XeQla_N6ExdSSihJtKPIoNA46OVWQqaMK6uQEdroPsEW3oLRMRCFsNpNCSjEtXPtLTtlwuphMPOYgM57mkerRlsIAGccqzGMc7tqqyjbMoUJrH4w9ltDteMUkg9cTWLdqqwbHFbRMxyTUTNqohNy_s_AR5Vq1KcKI1FL4B2GL0mI3k5p5sVUntpDLr45bCnESf_o2EjCeiIfioOVaP2d88UWzLOdOFE24p4UneL6v3ZCdvfgAiW3GdppRCR9JugbFX0MDlJE71M-pQxyKPKlijbjGXxFQrbpt6af7fnKofzXK9tzyDli88Ojb8Rte4YbwnXHXInleqxBL-9UN-BAiS-bWGX32F2Uul6mP2fwqEb71tIFrOU8FbTkZb9fpM7bGVs-LXr2J86Czz83yIAc3k4euaa_pSQZ6yl6gl_p0h8nANz-N4q--QcETPSaDrzLCuP-OF4NQYrbTLvlvdFYbPaEJ7XYvgilq9t6TildaCi5VYTnSucYX4aTV2KuLqk7C1aaMKvNSQN2wpPYaANY1UbTpgtfJPu7yI-yvgfsewmOUEeWCjPxrGp81bKzSGE60gyF_XK8lusGaen5MuP7q4znd3jTQIphfzWpGgnakxKpivVuZvty8u7d2Lr7puz4CFcE_UQ-oAX_044gNrWh7tBiKe0B9I47Qxov6EO4qzVYBNIlvgqVofQLjy2kB63rtUfDO713COhvS44HLjRZA6GbncDA85VH9IoyIxi2eMYZImwNPrKwdKAs6UksugCe9KH8Pq07c7orBrbA9Bg2eO8ea_ylGNBO7FnUF2U7YoILoh2QfvbbxvR9N9aeDs0EJkiS5bW2ezL1yDjhniHZYroYK-XE2a5_EUixf8Q1Y5xMh0SZCfI0AwXQGkhKxk1xHhYdnWujNpq4ZneaSBcxKoz3upyLoPhWRhLRsOZljmc4Z6SCTGfoe2DWNQ1pvwhNHhK5KPxu8M5GUn_EiKppkmRx-twtiJc4VeeUVRO-X_dQSClIBciT3U4m1gP4WwbPoezi_Hl-Xg8nk5G09GH0eXkA44WiBmdX15Mx9OL6eTy4v0vHy93Z-G_Nubo_ON0svsPqNFYrg?type=png)](https://mermaid.ai/live/edit#pako:eNqlV01z2zYQ_Sscnh2PGktRrJuijFsnTccTx-5M4x4gYkWhBgkOAMpmZf33LiASJPghyfWFIhcPuw-7DwtoG0aCQjgLQX5mJJYkeUiD4E6BDLbmLQiUliyNA0aDm6-eRWkgyTUN7nxzjnNTkoBnJBuiibyTfG81_r8LDoHEhzHtzOMWlGIiPRrYRMC4V75Vi0dIHZnPRMMPlkAAzxmToObad5rNKUWzcsENpVvQGkfVaxksheBBJtmGRMWcc_F0T3Kur9MN06AGIAvBOUQa13sYdyPFinG4Z_DkuP6K6a045jnSazBkqQ5IlnXrUtfkhhO9EjL5-XeQla_N6ExdSSihJtKPIoNA46OVWQqaMK6uQEdroPsEW3oLRMRCFsNpNCSjEtXPtLTtlwuphMPOYgM57mkerRlsIAGccqzGMc7tqqyjbMoUJrH4w9ltDteMUkg9cTWLdqqwbHFbRMxyTUTNqohNy_s_AR5Vq1KcKI1FL4B2GL0mI3k5p5sVUntpDLr45bCnESf_o2EjCeiIfioOVaP2d88UWzLOdOFE24p4UneL6v3ZCdvfgAiW3GdppRCR9JugbFX0MDlJE71M-pQxyKPKlijbjGXxFQrbpt6af7fnKofzXK9tzyDli88Ojb8Rte4YbwnXHXInleqxBL-9UN-BAiS-bWGX32F2Uul6mP2fwqEb71tIFrOU8FbTkZb9fpM7bGVs-LXr2J86Czz83yIAc3k4euaa_pSQZ6yl6gl_p0h8nANz-N4q--QcETPSaDrzLCuP-OF4NQYrbTLvlvdFYbPaEJ7XYvgilq9t6TildaCi5VYTnSucYX4aTV2KuLqk7C1aaMKvNSQN2wpPYaANY1UbTpgtfJPu7yI-yvgfsewmOUEeWCjPxrGp81bKzSGE60gyF_XK8lusGaen5MuP7q4znd3jTQIphfzWpGgnakxKpivVuZvty8u7d2Lr7puz4CFcE_UQ-oAX_044gNrWh7tBiKe0B9I47Qxov6EO4qzVYBNIlvgqVofQLjy2kB63rtUfDO713COhvS44HLjRZA6GbncDA85VH9IoyIxi2eMYZImwNPrKwdKAs6UksugCe9KH8Pq07c7orBrbA9Bg2eO8ea_ylGNBO7FnUF2U7YoILoh2QfvbbxvR9N9aeDs0EJkiS5bW2ezL1yDjhniHZYroYK-XE2a5_EUixf8Q1Y5xMh0SZCfI0AwXQGkhKxk1xHhYdnWujNpq4ZneaSBcxKoz3upyLoPhWRhLRsOZljmc4Z6SCTGfoe2DWNQ1pvwhNHhK5KPxu8M5GUn_EiKppkmRx-twtiJc4VeeUVRO-X_dQSClIBciT3U4m1gP4WwbPoezi_Hl-Xg8nk5G09GH0eXkA44WiBmdX15Mx9OL6eTy4v0vHy93Z-G_Nubo_ON0svsPqNFYrg)
---

## Enums

| Enum                   | Values                                                                                        | Used By             |
|------------------------|-----------------------------------------------------------------------------------------------|---------------------|
| `Platform`             | `WINDOWS`, `LINUX`, `MAC`                                                                     | `Game.platforms`    |
| `CollectionVisibility` | `PRIVATE`, `FRIENDS`, `PUBLIC`                                                                | `Collection.type`   |
| `GameType`             | `GAME`, `DLC`, `DEMO`, `MOD`, `ADVERTISING`, `UNKNOWN`                                        | `Game.type`         |
| `KeyVaultAuthType`     | `NONE`, `PIN`, `PASSWORD`                                                                     | `KeyVault.authType` |
| `UserRole`             | `USER`, `ADMIN`                                                                               | `User.role`         |
| `AppSettingKey`        | 23 keys (see below)                                                                           | `AppSetting.key`    |
| `JobType`              | `SYNC_STEAM_GAMES`, `IMPORT_USER_LIBRARY`, `IMPORT_USER_ACHIEVEMENTS`, `REFRESH_GAME_DETAILS` | `Job.type`          |
| `JobStatus`            | `QUEUED`, `ACTIVE`, `COMPLETED`, `PARTIALLY_COMPLETED`, `FAILED`, `CANCELED`                  | `Job.status`        |

---

## Models

### `AppSetting`

A key-value store for platform-wide configuration. Keys are strongly typed via the `AppSettingKey` enum and cover:

- **Signup / account lifecycle** — allow signups, account deletion, invite code generation
- **Session** — configurable session timeout
- **Vault security** — auth type defaults, password/PIN length limits, brute-force blocking, sharing controls
- **Admin permissions** — whether admins can delete vaults/collections owned by other users, change resource ownership
- **Limits** — max vaults and collections per user
- **Visibility** — whether public collections are permitted

---

### `User`

The central entity. Users authenticate exclusively via **Steam** (`steamId` is unique). Each user has:

- A `role` (`USER` or `ADMIN`)
- Many `sessions` (multi-device login)
- A single optional `UserSettings` record (which is created with a default on user creation)
- A Steam game library via `UserGame`
- Owned `Collection`s and `KeyVault`s
- Membership in other users' collections and vaults via junction tables

---

### `Session`

Tracks active login sessions. Each session stores:

- A unique opaque `token` for authentication
- `expiresAt` for TTL enforcement (indexed)
- `userAgent` and `ipAddress` for audit/security

Sessions cascade-delete when a user is deleted.

---

### `UserSettings`

One-to-one with `User`. Stores privacy toggles:

- `privacyAllowVaultInvites` — whether others can add this user to their key vault
- `privacyAllowCollectionInvites` — whether others can add this user to their collections
- `privacyAllowProfileView` — whether this user's profile is publicly visible

---

### `Game`

The canonical game catalog, populated from the Steam API. Key fields:

- `appId` — Steam App ID
- `search_vector` — a PostgreSQL `tsvector` column with a GIN index for full-text search
- `platforms`, `tags`, `developers`, `publishers` — stored as arrays
- `type` — distinguishes games from DLCs, demos, mods, etc.
- `detailsFetchedAt` / `steamLastModified` — used to decide when to re-fetch

Games have many-to-many relations with `Category` and `Genre`.

---

### `Category` and `Genre`

Lookup tables for Steam categories (e.g. "Multi-player", "Steam Achievements") and genres (e.g. "Action", "RPG"). Both use integer IDs from Steam alongside a human-readable `name`. Many-to-many with `Game`.

---

### `Achievement`

Per-game achievement definitions synced from Steam. Each achievement has:

- `name` — the internal Steam key
- `displayName`, `description`, `icon`, `icongray` — display metadata
- `hidden` — whether the achievement is secret until unlocked
- Unique on `(gameId, name)`

---

### `UserGame`

Junction between `User` and `Game` representing a game in the user's Steam library. Tracks:

- `playtime` / `playtime2Weeks` — total and recent playtime in minutes
- `lastPlayed`

---

### `UserGameAchievement`

Records a specific user earning a specific achievement. Junction between `UserGame` and `Achievement`, with `achievedAt` timestamp. Unique on `(userGameId, achievementId)`.

---

### `Collection`

A curated list of games created by a user. Has:

- `type` — visibility: `PRIVATE`, `FRIENDS`, or `PUBLIC`
- A list of member `User`s via `CollectionUser`
- A list of `Game`s via `CollectionGame`

---

### `CollectionUser`

Many-to-many between `Collection` and `User`. Tracks who was added, who added them, and whether they have `canModify` permission. The `addedBy` relation allows auditing of who invited whom.

---

### `CollectionGame`

Many-to-many between `Collection` and `Game`. Supports optional `notes` per entry and records which user added the game.

---

### `KeyVault`

A secure container for storing game activation keys. Each vault has:

- A `name` (globally unique)
- An `authType` — `NONE`, `PIN`, or `PASSWORD`
- `authHash` / `authSalt` — for verifying the PIN or password without storing it in plaintext
- A list of authorized users (`KeyVaultUser`) and stored keys (`KeyVaultGame`)

---

### `KeyVaultUser`

Membership record for a vault. Per-user permission flags:

- `canRedeem` — can mark keys as redeemed
- `canCreate` — can add new keys to the vault

---

### `KeyVaultGame`

A single stored activation key. Fields:

- `key` — the actual key string (unique per vault)
- `hashedKey` — optional hashed version for verification
- `originalName` — the game name as entered by the user (decoupled from the `Game` relation, which is optional)
- `redeemed` / `redeemedAt` / `redeemedBy` — redemption audit trail. `redeemedBy` uses `SetNull` on delete so the record is preserved even if the user is removed.

---

### `InviteCode`

Short codes (8-char MD5 prefix by default) used to gate user registration. Supports:

- Optional `expiresAt` for time-limited codes
- Optional `maxUses` for limited-use codes
- Usage tracking via `InviteCodeUsage`

---

### `InviteCodeUsage`

Records each use of an invite code — which user used it and when.

---

### `Job`

Represents a background task submitted to the worker service. Fields:

- `type` — one of the four `JobType` values
- `status` — lifecycle state from `QUEUED` through `COMPLETED` or `FAILED`
- `progress`, `processedItems`, `totalItems`, `failedItems` — for progress tracking
- `allItemsQueued` — flag indicating the queue is fully populated (useful for fan-out jobs)
- `claimedBy` — worker instance ID that picked up the job (indexed for worker coordination)
- `startedAt`, `finishedAt`, `errorMessage` — timing and error capture
- Optional `userId` — the user who triggered the job (uses `SetNull` on delete)

---

### `JobLog`

Append-only structured log lines attached to a job. Each entry has a `level` (e.g. `info`, `warn`, `error`) and a free-text `message`.

---

### `FailedChildJob`

Records individual item failures within a batch job (e.g. a single game that failed to sync within a larger import). Stores the Steam `appId`, the internal `gameId`, the error message, and the number of `attempts` made.

---

## Key Design Patterns

**Soft-coupled redemption** — `KeyVaultGame.redeemedBy` uses `onDelete: SetNull` so redemption history survives user deletion. The same pattern is used on `Job.userId`.

**Dual-client generation** — `schema.prisma` defines two `generator` blocks (`client_web` and `client_worker`), producing separate Prisma clients for the web app and the background worker. This allows independent deployment while sharing a single source-of-truth schema.

**Full-text search on games** — The `Game.search_vector` column is a native PostgreSQL `tsvector` with a GIN index, enabling efficient `to_tsquery` searches without an external search service.

**Audit trails on junctions** — All many-to-many junction tables (`CollectionUser`, `CollectionGame`, `KeyVaultUser`, `KeyVaultGame`) record `addedBy` as a separate `User` relation, supporting full auditability of who made changes.

**Invite code defaults in SQL** — `InviteCode.code` uses `dbgenerated("substring(md5(random()::text), 1, 8)")` so codes are generated in the database, avoiding a round-trip to application code.