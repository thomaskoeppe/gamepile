"use server";

import {z} from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {KeyVaultGameGetPayload, KeyVaultGameWhereInput} from "@/prisma/generated/models/KeyVaultGame";
import {queryClientWithAuth} from "@/server/query";

const SORT_FIELD_MAP = {
    game_name: { game: { name: "asc" as const } },
    addedAt: { addedAt: "asc" as const },
    redeemedAt: { redeemedAt: "asc" as const },
    originalName: { originalName: "asc" as const },
} as const;

export const getKeys = queryClientWithAuth.inputSchema(z.object({
    keyVaultId: z.cuid(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    sortBy: z.enum(["game_name", "addedAt", "redeemedAt", "originalName"]).optional(),
    sortOrder: z.enum(["asc", "desc"]),
    filters: z.object({
        name: z.string().optional(),
        tags: z.array(z.string()),
        isOwned: z.boolean().optional(),
        isRedeemed: z.boolean().optional(),
    })
})).query<{ games: Array<KeyVaultGameGetPayload<{ include: { game: { include: { categories: true, genres: true }}, addedBy: { select: { id: true, username: true, avatarUrl: true } }, redeemedBy: { select: { id: true, username: true, avatarUrl: true } } }}> & { isInMultipleVaults: boolean; }>; total: number; pages: number; page: number; }>(withLogging(async ({ parsedInput: { keyVaultId, page, pageSize, sortBy, sortOrder, filters }, ctx }, { log }) => {
    const offset = (page - 1) * pageSize;
    let orderBy: Record<string, unknown> | undefined;

    log.info("Fetching keys for vault", {
        userId: ctx.user.id,
        keyVaultId,
        page,
        pageSize,
        sortBy,
        sortOrder,
        filters,
    });

    const hasVaultAccess = await prisma.keyVault.findFirst({
        where: {
            id: keyVaultId,
            OR: [{ createdById: ctx.user.id }, { users: { some: { userId: ctx.user.id } } }],
        },
        select: { id: true },
    });

    if (!hasVaultAccess) {
        throw new Error("Vault not found or access denied.");
    }

    if (sortBy) {
        const baseOrderBy = SORT_FIELD_MAP[sortBy];
        if ("game" in baseOrderBy) {
            orderBy = { game: { name: sortOrder } };
        } else {
            const [field] = Object.keys(baseOrderBy);
            orderBy = { [field]: sortOrder };
        }
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

    if (filters.isRedeemed !== null && filters.isRedeemed !== undefined) {
        filter.push({
            redeemed: filters.isRedeemed,
        });
    }

    const where = {
        AND: [
            { keyVaultId },
            ...filter,
        ],
    };

    const [games, total] = await Promise.all([
        prisma.keyVaultGame.findMany({
            where,
            include: {
                game: {
                    include: {
                        categories: true,
                        genres: true
                    }
                },
                addedBy: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
                redeemedBy: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
            },
            orderBy: orderBy ? orderBy : undefined,
            skip: offset,
            take: pageSize,
        }),
        prisma.keyVaultGame.count({
            where,
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