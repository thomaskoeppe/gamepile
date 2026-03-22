"use server";

import {z} from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {KeyVaultGameGetPayload, KeyVaultGameWhereInput} from "@/prisma/generated/models/KeyVaultGame";
import {queryClientWithAuth} from "@/server/query";

export const getKeys = queryClientWithAuth.inputSchema(z.object({
    keyVaultId: z.cuid(),
    page: z.number().int().positive(),
    pageSize: z.number().positive(),
    sortBy: z.string(),
    sortOrder: z.enum(["asc", "desc"]),
    filters: z.object({
        name: z.string().optional(),
        tags: z.array(z.string()),
        isOwned: z.boolean().optional(),
    })
})).query<{ games: Array<KeyVaultGameGetPayload<{ include: { game: { include: { categories: true, genres: true }}, addedBy: true, redeemedBy: true }}> & { isInMultipleVaults: boolean; }>; total: number; pages: number; page: number; }>(withLogging(async ({ parsedInput: { keyVaultId, page, pageSize, sortBy, sortOrder, filters }, ctx }, { log }) => {
    const offset = (page - 1) * pageSize;
    let orderBy: { [key: string]: { [key: string]: "asc" | "desc" } } | undefined = undefined;

    log.info("Fetching keys for vault", {
        userId: ctx.user.id,
        keyVaultId,
        page,
        pageSize,
        sortBy,
        sortOrder,
        filters,
    });

    if (sortBy) {
        const parts = sortBy.split("_");
        orderBy = {
            [parts[0]]: {
                [parts[1]]: sortOrder
            }
        };
    }

    const filter: KeyVaultGameWhereInput[] = [];

    if (filters.name) {
        filter.push({ game: { name: { contains: filters.name, mode: "insensitive" } } });
    }

    if (filters.tags) {
        const g = [];
        const c = [];

        for (const tag of filters.tags) {
            const t = tag.split("_");
            if (t[0] === "category") {
                c.push(t[1]);
            } else {
                g.push(t[1]);
            }
        }

        const f = [];

        if (g.length > 0) {
            f.push({ genres: { some: { name: { in: g } } } });
        }

        if (c.length > 0) {
            f.push({ categories: { some: { name: { in: c } } } });
        }

        if (f.length > 0) {
            filter.push({
                game: {
                    OR: f
                }
            });
        }
    }

    if (filters.isOwned !== null && filters.isOwned !== undefined) {
        if (filters.isOwned) {
            filter.push({
                game: {
                    userGames: {
                        some: {
                            userId: ctx.user.id
                        }
                    }
                }
            });
        } else {
            filter.push({
                game: {
                    userGames: {
                        none: {
                            userId: ctx.user.id
                        }
                    }
                }
            });
        }
    }

    const [games, total] = await Promise.all([
        prisma.keyVaultGame.findMany({
            where: {
                AND: [
                    { keyVaultId },
                    ...filter
                ]
            },
            include: {
                game: {
                    include: {
                        categories: true,
                        genres: true
                    }
                },
                addedBy: true,
                redeemedBy: true
            },
            orderBy: orderBy ? orderBy : undefined,
            skip: offset,
            take: pageSize,
        }),
        prisma.keyVaultGame.count({
            where: {
                keyVaultId
            }
        })
    ]);

    const gameIds = games.map((g) => g.gameId).filter(Boolean) as string[];
    const multiVaultCounts = await prisma.keyVaultGame.groupBy({
        by: ["gameId"],
        where: {
            gameId: { in: gameIds },
            keyVaultId: { not: keyVaultId },
        },
        _count: true,
    });
    const multiVaultSet = new Set(multiVaultCounts.map((r) => r.gameId));

    return {
        games: games.map((g) => ({
            ...g,
            isInMultipleVaults: multiVaultSet.has(g.gameId),
        })),
        total,
        pages: Math.ceil(total / pageSize),
        page,
    };
}, {
    namespace: "server.queries.vault-keys:getKeys",
}));