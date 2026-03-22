import {Prisma} from "@/src/prisma/generated/client.js";
import prisma from "@/src/lib/prisma.js";
import {logger} from "@/src/lib/logger.js";

const log = logger.child("worker.helper");

const UPSERT_CHUNK_SIZE = 500;

type StubInput = {
    appId: number;
    name:  string;
    steamLastModified: number;
};

/**
 * Bulk-upserts minimal game records ("stubs") from the Steam catalog into the
 * database. Processes in chunks of {@link UPSERT_CHUNK_SIZE} to avoid exceeding
 * PostgreSQL parameter limits. Only updates existing rows when `steamLastModified`
 * has changed.
 *
 * @param stubs - Array of game stub objects to upsert.
 */
export async function upsertGameStubs(stubs: StubInput[]): Promise<void> {
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

        log.info(`Upserting ${chunk.length} game stubs`, {
            count: chunk.length,
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
 * Returns the set of game IDs (from the provided list) that are referenced by at
 * least one user-game, collection-game, or vault-game record. Used to avoid deleting
 * games that are still in use.
 *
 * @param gameIds - Array of game IDs to check.
 * @returns A `Set` of game IDs that have at least one association.
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