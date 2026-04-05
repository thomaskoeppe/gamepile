import {Prisma} from "@/src/prisma/generated/client.js";
import prisma from "@/src/lib/prisma.js";
import {logger} from "@/src/lib/logger.js";

const log = logger.child("worker.lib.helper");

/** Number of game stubs to upsert per SQL batch to avoid oversized queries. */
const UPSERT_CHUNK_SIZE = 500;

/**
 * Input shape for a minimal game stub to be upserted into the database.
 */
type GameStubInput = {
    /** Steam application ID. */
    appId: number;
    /** Display name of the game. */
    name:  string;
    /** Unix timestamp of the last modification on Steam, or null if unknown. */
    steamLastModified: number | null;
};

/**
 * Bulk-upserts minimal game stub records into the `Game` table.
 *
 * Uses raw SQL with `ON CONFLICT` for high-throughput inserts. Stubs are inserted
 * in chunks of {@link UPSERT_CHUNK_SIZE} to avoid exceeding PostgreSQL parameter limits.
 * Existing rows are only updated when their `steamLastModified` value has changed.
 *
 * @param stubs - Array of game stubs to upsert.
 */
export async function upsertGameStubs(stubs: GameStubInput[]): Promise<void> {
    for (let i = 0; i < stubs.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = stubs.slice(i, i + UPSERT_CHUNK_SIZE);

        const values = chunk.map((s) =>
            Prisma.sql`(
            ${s.appId},
            ${s.name},
            ${s.steamLastModified},
            'UNKNOWN',
            false,
            NOW(),
            NOW()
          )`
        );

        log.debug("Upserting game stubs chunk", {
            chunkSize: chunk.length,
            offset: i,
        });

        await prisma.$executeRaw`
          INSERT INTO "Game" (
            "appId",
            "name",
            "steamLastModified",
            "type",
            "isFree",
            "createdAt",
            "updatedAt"
          )
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("appId") DO UPDATE SET
            "name"              = EXCLUDED."name",
            "steamLastModified" = EXCLUDED."steamLastModified",
            "updatedAt"         = NOW()
          WHERE "Game"."steamLastModified" IS DISTINCT FROM EXCLUDED."steamLastModified"
    `;
    }
}

/**
 * Returns the set of game IDs that are "connected" — i.e., referenced by at least
 * one user library entry, collection, or key vault.
 *
 * This is used to prioritize detail fetching for games that users actually interact with.
 *
 * @param gameIds - Array of game IDs (UUIDs) to check.
 * @returns A `Set` of game IDs that have at least one connection.
 */
export async function getConnectedGameIds(gameIds: string[]): Promise<Set<string>> {
    if (gameIds.length === 0) return new Set();

    const connected = await prisma.game.findMany({
        where: {
            id: { in: gameIds },
            OR: [
                { userGames:       { some: {} } },
                { collectionGames: { some: {} } },
                { keyVaultGames:   { some: {} } },
            ],
        },
        select: { id: true },
    });

    return new Set(connected.map((g) => g.id));
}