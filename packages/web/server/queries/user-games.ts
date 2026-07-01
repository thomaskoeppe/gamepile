"use server";

import prisma from "@/lib/prisma";
import {withLogging} from "@/lib/with-logging";
import {Prisma} from "@/prisma/generated/client";
import {queryClientWithAuth} from "@/server/query";

/**
 * Fetches all games owned by the authenticated user, enriched with per-user
 * playtime and last-played date from the `UserGame` join table.
 *
 * @returns Array of game objects (including categories and tags) augmented
 *   with `playtime` and `playtime2Weeks` (minutes), and an `owned` flag
 *   always set to `true`.
 */
export const getGamesForUser = queryClientWithAuth.query<Array<Prisma.GameGetPayload<{ include: { categories: true, tags: true } }> & { playtime?: number; playtime2Weeks?: number; owned: boolean }>>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching games for user", {
        userId: ctx.user.id,
    });

    const games = await prisma.userGame.findMany({
        where: {
            userId: ctx.user.id
        },
        include: {
            game: {
                include: {
                    categories: true,
                    tags: true,
                }
            }
        }
    });

    return games.map((userGame) => ({
        ...userGame.game,
        playtime: userGame.playtime,
        playtime2Weeks: userGame.playtime2Weeks,
        owned: true,
    }));
}, {
    namespace: "server.queries.user-games:getGamesForUser"
}));