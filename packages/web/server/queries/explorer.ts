"use server";

import { z } from "zod";

import prisma from "@/lib/prisma";
import { searchGameIds } from "@/lib/search-query";
import { withLogging } from "@/lib/with-logging";
import { GameType,Platform, Prisma } from "@/prisma/generated/client";
import { queryClientWithAuth } from "@/server/query";
import type { ExplorerFilterOptions,ExplorerFilters, ExplorerGameRow, ExplorerSort } from "@/types/explorer";

function buildWhere(
    filters: ExplorerFilters,
    userId: string,
    searchIds?: string[],
): Prisma.GameWhereInput {
    const conditions: Prisma.GameWhereInput[] = [];

    if (searchIds) conditions.push({ id: { in: searchIds } });
    if (filters.genreIds?.length) conditions.push({ genres: { some: { id: { in: filters.genreIds } } } });
    if (filters.categoryIds?.length) conditions.push({ categories: { some: { id: { in: filters.categoryIds } } } });
    if (filters.platforms?.length) conditions.push({ platforms: { hasSome: filters.platforms as Platform[] } });
    if (filters.gameType) conditions.push({ type: filters.gameType });
    if (filters.isFree === true) conditions.push({ isFree: true });
    if (filters.isFree === false) conditions.push({ isFree: false });
    if (filters.metacriticMin != null) conditions.push({ metacriticScore: { gte: filters.metacriticMin } });
    if (filters.metacriticMax != null) conditions.push({ metacriticScore: { lte: filters.metacriticMax } });
    if (filters.releaseDateFrom) conditions.push({ releaseDate: { gte: new Date(filters.releaseDateFrom) } });
    if (filters.releaseDateTo) conditions.push({ releaseDate: { lte: new Date(filters.releaseDateTo) } });
    if (filters.ownership === "owned") conditions.push({ userGames: { some: { userId } } });
    if (filters.ownership === "unowned") conditions.push({ userGames: { none: { userId } } });

    return conditions.length > 0 ? { AND: conditions } : {};
}

function buildOrderBy(sort: ExplorerSort): Prisma.GameOrderByWithRelationInput {
    switch (sort.field) {
        case "name": return { name: sort.direction };
        case "releaseDate": return { releaseDate: { sort: sort.direction, nulls: "last" } };
        case "metacriticScore": return { metacriticScore: { sort: sort.direction, nulls: "last" } };
        case "type": return { type: sort.direction };
        default: return { name: "asc" };
    }
}

function mapGame(
    g: Prisma.GameGetPayload<{
        include: {
            genres: { select: { id: true; name: true } };
            categories: { select: { id: true; name: true } };
            userGames: { select: { id: true } };
        };
    }>
): ExplorerGameRow {
    return {
        id: g.id,
        appId: g.appId,
        name: g.name,
        shortDescription: g.shortDescription,
        metacriticScore: g.metacriticScore,
        isFree: g.isFree,
        releaseDate: g.releaseDate,
        type: g.type,
        platforms: g.platforms,
        developers: g.developers,
        publishers: g.publishers,
        genres: g.genres,
        categories: g.categories,
        owned: g.userGames.length > 0,
    };
}

const filtersSchema = z.object({
    search: z.string(),
    genreIds: z.array(z.string()),
    categoryIds: z.array(z.string()),
    platforms: z.array(z.enum(Platform)),
    gameType: z.enum(GameType).nullable(),
    isFree: z.boolean().nullable(),
    metacriticMin: z.number().nullable(),
    metacriticMax: z.number().nullable(),
    releaseDateFrom: z.string().nullable(),
    releaseDateTo: z.string().nullable(),
    ownership: z.enum(["all", "owned", "unowned"]).optional(),
});

type ExplorerGamesResult = {
    data: ExplorerGameRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export const getExplorerGames = queryClientWithAuth
    .inputSchema(z.object({
        filters: filtersSchema,
        sort: z.object({
            field: z.enum(["name", "releaseDate", "metacriticScore", "type"]),
            direction: z.enum(["asc", "desc"]),
        }),
        pagination: z.object({
            page: z.number().int().positive(),
            pageSize: z.number().int().positive(),
        }),
    }))
    .query<ExplorerGamesResult>(withLogging(async ({ parsedInput: { filters, sort, pagination }, ctx }, { log }) => {
        log.info("Fetching explorer games", { filters, sort, pagination, userId: ctx.user.id });

        if (filters.search.trim().length >= 2) {
            const { ids: pageIds, total } = await searchGameIds(filters.search, {
                limit: pagination.pageSize,
                offset: (pagination.page - 1) * pagination.pageSize,
            });

            if (total === 0) {
                return { data: [], total: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
            }

            const rawGames = await prisma.game.findMany({
                where: buildWhere(filters, ctx.user.id, pageIds),
                include: {
                    genres: { select: { id: true, name: true } },
                    categories: { select: { id: true, name: true } },
                    userGames: { where: { userId: ctx.user.id }, select: { id: true }, take: 1 },
                },
            });

            const idOrder = new Map(pageIds.map((id, i) => [id, i]));
            rawGames.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

            return {
                data: rawGames.map(mapGame),
                total,
                page: pagination.page,
                pageSize: pagination.pageSize,
                totalPages: Math.ceil(total / pagination.pageSize),
            };
        }

        const where = buildWhere(filters, ctx.user.id);

        const [rawGames, total] = await Promise.all([
            prisma.game.findMany({
                where,
                include: {
                    genres: { select: { id: true, name: true } },
                    categories: { select: { id: true, name: true } },
                    userGames: { where: { userId: ctx.user.id }, select: { id: true }, take: 1 },
                },
                orderBy: buildOrderBy(sort),
                skip: (pagination.page - 1) * pagination.pageSize,
                take: pagination.pageSize,
            }),
            prisma.game.count({ where }),
        ]);

        return {
            data: rawGames.map(mapGame),
            total,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalPages: Math.ceil(total / pagination.pageSize),
        };
    }, { namespace: "server.queries.explorer:getExplorerGames" }));

export const getExplorerFilterOptions = queryClientWithAuth
    .query<ExplorerFilterOptions>(withLogging(async ({ ctx }, { log }) => {
        log.info("Fetching explorer filter options", { userId: ctx.user.id });

        const [genres, categories] = await Promise.all([
            prisma.genre.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
            prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        ]);

        return { genres, categories };
    }, { namespace: "server.queries.explorer:getExplorerFilterOptions" }));