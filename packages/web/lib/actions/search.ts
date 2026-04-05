"use server";

import {getCurrentSession} from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import {redis} from "@/lib/redis";
import {RankedGameResult,searchGamesRanked} from "@/lib/search-query";
import {Category, Prisma, Tag} from "@/prisma/generated/client";

const log = logger.child("server.actions.search");

const SEARCH_CACHE_TTL = 5 * 60;
const RECENT_TTL = 7 * 24 * 60 * 60;
const TRENDING_BUCKET_TTL = 25 * 60 * 60;
const MAX_RECENT = 5;
const MAX_TRENDING = 10;
const RESULT_LIMIT = 5;

export type SearchResultType = "game" | "collection" | "vault" | "category" | "tag";

export interface SearchResult {
    type: SearchResultType;
    id: string;
    name: string;
    description?: string;
    image?: string;
    icon?: string;
    appId?: number;
    metadata?: Record<string, string | number | boolean | Date>;
}

export interface SearchResults {
    games: SearchResult[];
    collections: SearchResult[];
    vaults: SearchResult[];
    categories: SearchResult[];
    tags: SearchResult[];
    totalCount: number;
}

export interface RecentSearch {
    query: string;
    searchedAt: number;
}

type CollectionWithCount = Prisma.CollectionGetPayload<{
    include: { _count: { select: { games: true } } };
}>;

type VaultWithCount = Prisma.KeyVaultGetPayload<{
    include: { _count: { select: { games: true } } };
}>;

function hourBucket(offsetHours = 0): string {
    const d = new Date(Date.now() - offsetHours * 3_600_000);
    return [
        d.getUTCFullYear(),
        String(d.getUTCMonth() + 1).padStart(2, "0"),
        String(d.getUTCDate()).padStart(2, "0"),
        String(d.getUTCHours()).padStart(2, "0"),
    ].join("");
}

const rk = {
    results: (q: string) => `search:results:${q}`,
    recent: (uid: string) => `search:recent:${uid}`,
    trendingBucket: (h: string) => `search:trending:${h}`,
    trendingTemp: () => `search:trending:temp:${Date.now()}:${Math.random()}`,
} as const;

function normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function fireAndForget(promise: Promise<unknown>, label: string): void {
    promise.catch((err) => log.error(`${label} failed`, err instanceof Error ? err : new Error(String(err))));
}

function collectionToSearchResult(collection: CollectionWithCount): SearchResult {
    return {
        type: "collection",
        id: collection.id,
        name: collection.name,
        description: collection.description ?? undefined,
        metadata: {gameCount: collection._count.games},
    };
}

function vaultToSearchResult(vault: VaultWithCount): SearchResult {
    return {
        type: "vault",
        id: vault.id,
        name: vault.name,
        icon: "archive",
        metadata: {itemCount: vault._count.games},
    };
}

function categoryToSearchResult(category: Category): SearchResult {
    return {type: "category", id: category.id, name: category.name};
}

function tagToSearchResult(tag: Tag): SearchResult {
    return {type: "tag", id: tag.id, name: tag.name};
}

/** Retrieves the authenticated user's recent search queries from Redis. */
export async function getRecentSearches(): Promise<RecentSearch[]> {
    const session = await getCurrentSession();
    if (!session) return [];

    const raw = await redis.zrevrangebyscore(
        rk.recent(session.user.id),
        "+inf",
        "-inf",
        "WITHSCORES",
        "LIMIT", 0, MAX_RECENT,
    );

    const searches: RecentSearch[] = [];
    for (let i = 0; i < raw.length; i += 2) {
        searches.push({query: raw[i], searchedAt: Number(raw[i + 1])});
    }
    return searches;
}

/** Removes a single query from the authenticated user's recent searches. */
export async function removeRecentSearch(query: string): Promise<void> {
    const session = await getCurrentSession();
    if (!session) return;

    await redis.zrem(rk.recent(session.user.id), normalizeQuery(query));
}

/** Clears all of the authenticated user's recent searches. */
export async function clearRecentSearches(): Promise<void> {
    const session = await getCurrentSession();
    if (!session) return;

    await redis.del(rk.recent(session.user.id));
}

async function recordRecentSearch(userId: string, query: string): Promise<void> {
    const key = rk.recent(userId);
    const pipe = redis.pipeline();
    pipe.zadd(key, Date.now(), query);
    pipe.zremrangebyrank(key, 0, -(MAX_RECENT + 1));
    pipe.expire(key, RECENT_TTL);
    await pipe.exec();
}

async function incrementTrending(query: string): Promise<void> {
    const key = rk.trendingBucket(hourBucket());
    const pipe = redis.pipeline();
    pipe.zincrby(key, 1, query);
    pipe.expire(key, TRENDING_BUCKET_TTL);
    await pipe.exec();
}

export async function getTrendingSearches(lookbackHours = 24): Promise<string[]> {
    const bucketKeys = Array.from({length: lookbackHours}, (_, i) =>
        rk.trendingBucket(hourBucket(i)),
    );

    const tempKey = rk.trendingTemp();

    const pipe = redis.pipeline();
    pipe.zunionstore(tempKey, bucketKeys.length, ...bucketKeys);
    pipe.expire(tempKey, 30);
    await pipe.exec();

    const results = await redis.zrevrange(tempKey, 0, MAX_TRENDING - 1);
    fireAndForget(redis.del(tempKey), "trendingTemp cleanup");

    return results;
}

function rankedGameToSearchResult(game: RankedGameResult): SearchResult {
    return {
        type: "game",
        id: game.id,
        name: game.name,
        description: game.shortDescription ?? undefined,
        appId: game.appId ?? undefined,
        metadata: {
            reviewScore: game.reviewScore ?? 0,
            isFree: game.isFree,
            ...(game.releaseDate ? {releaseDate: game.releaseDate} : {}),
        },
    };
}

function buildSearchQueries(q: string) {
    const numericId = isNaN(Number(q)) ? null : Number(q);

    const gameNameOrId = {
        OR: [
            {name: {contains: q, mode: "insensitive" as const}},
            ...(numericId !== null ? [{appId: numericId}] : []),
        ],
    };

    const containsMatchingGame = {
        some: {game: gameNameOrId},
    };

    return {
        games: searchGamesRanked(q, RESULT_LIMIT),

        collections: prisma.collection.findMany({
            where: {
                OR: [
                    {name: {contains: q, mode: "insensitive"}},
                    {games: containsMatchingGame},
                ],
            },
            include: {_count: {select: {games: true}}},
            take: RESULT_LIMIT,
        }),

        vaults: prisma.keyVault.findMany({
            where: {
                OR: [
                    {name: {contains: q, mode: "insensitive"}},
                    {games: containsMatchingGame},
                ],
            },
            include: {_count: {select: {games: true}}},
            take: RESULT_LIMIT,
        }),

        categories: prisma.category.findMany({
            where: {name: {contains: q, mode: "insensitive"}},
            take: RESULT_LIMIT,
        }),

        tags: prisma.tag.findMany({
            where: {name: {contains: q, mode: "insensitive"}},
            take: RESULT_LIMIT,
        }),
    };
}

export async function search(query: string): Promise<SearchResults | null> {
    const session = await getCurrentSession();
    if (!session) return null;

    const q = normalizeQuery(query);

    if (!q) {
        return {games: [], collections: [], vaults: [], categories: [], tags: [], totalCount: 0};
    }

    const cached = await redis.get(rk.results(q));
    if (cached) {
        log.debug(`Cache hit: "${q}"`);
        fireAndForget(incrementTrending(q), "incrementTrending (hit)");
        if (session.user.id) fireAndForget(recordRecentSearch(session.user.id, q), "recordRecent (hit)");
        return JSON.parse(cached) as SearchResults;
    }

    log.debug(`Cache miss: "${q}"`);

    const queries = buildSearchQueries(q);
    const [games, collections, vaults, categories, tags] = await Promise.all([
        queries.games,
        queries.collections,
        queries.vaults,
        queries.categories,
        queries.tags,
    ]);

    const results: SearchResults = {
        games: games.map(rankedGameToSearchResult),
        collections: collections.map(collectionToSearchResult),
        vaults: vaults.map(vaultToSearchResult),
        categories: categories.map(categoryToSearchResult),
        tags: tags.map(tagToSearchResult),
        totalCount:
            games.length + collections.length + vaults.length +
            categories.length + tags.length,
    };

    fireAndForget(redis.set(rk.results(q), JSON.stringify(results), "EX", SEARCH_CACHE_TTL), "cacheSet");
    fireAndForget(incrementTrending(q), "incrementTrending (miss)");
    if (session.user.id) fireAndForget(recordRecentSearch(session.user.id, q), "recordRecent (miss)");

    return results;
}