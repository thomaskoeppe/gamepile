import { NextRequest, NextResponse } from "next/server";

import { consumeRateLimit, getClientIp, searchLimiter } from "@/lib/auth/rate-limit";
import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { searchGamesRanked } from "@/lib/search-query";

const MIN_QUERY_LENGTH = 2;

export async function GET(request: NextRequest) {
    const log = logger.child("api.routes.search:get");
    const start = Date.now();

    const sessionData = await getCurrentSession();
    if (!sessionData) {
        log.warn("Search rejected — no session", { durationMs: Date.now() - start });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = sessionData.user.id;
    const ip = getClientIp(request);
    const rl = await consumeRateLimit(searchLimiter, `user:${userId}:ip:${ip}`);
    if (!rl.success) {
        log.warn("Search rate-limited", { userId, ip, retryAfterMs: rl.retryAfterMs, durationMs: Date.now() - start });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
    }

    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < MIN_QUERY_LENGTH) {
        log.debug("Search query too short", { query: q, minLength: MIN_QUERY_LENGTH });
        return NextResponse.json({
            games: [],
            vaultGames: [],
            collectionGames: [],
            categories: [],
            tags: [],
            users: [],
        });
    }

    log.info("Search request", { userId, query: q });

    const contains = q;
    const mode = "insensitive" as const;

    const [rankedGames, vaultGames, collectionGames, categories, tags, users] = await Promise.all([
        searchGamesRanked(q, 8),

        prisma.keyVaultGame.findMany({
            where: {
                originalName: { contains, mode },
                keyVault: {
                    OR: [
                        { createdById: userId },
                        { users: { some: { userId } } },
                    ],
                },
            },
            select: {
                id: true,
                originalName: true,
                redeemed: true,
                keyVault: { select: { id: true, name: true } },
            },
            take: 5,
            orderBy: { originalName: "asc" },
        }),

        prisma.collectionGame.findMany({
            where: {
                game: { name: { contains, mode } },
                collection: {
                    OR: [
                        { createdById: userId },
                        { users: { some: { userId } } },
                        { type: "PUBLIC" },
                    ],
                },
            },
            select: {
                collection: { select: { id: true, name: true } },
                game: { select: { id: true, name: true, appId: true } },
            },
            take: 5,
            orderBy: { game: { name: "asc" } },
        }),

        prisma.category.findMany({
            where: { name: { contains, mode } },
            select: {
                id: true,
                name: true,
                _count: { select: { games: true } },
            },
            take: 5,
            orderBy: { name: "asc" },
        }),

        prisma.tag.findMany({
            where: { name: { contains, mode } },
            select: {
                id: true,
                name: true,
                _count: { select: { games: true } },
            },
            take: 5,
            orderBy: { name: "asc" },
        }),

        prisma.user.findMany({
            where: { username: { contains, mode } },
            select: {
                id: true,
                username: true,
                avatarUrl: true,
            },
            take: 5,
            orderBy: { username: "asc" },
        }),
    ]);

    log.info("Search completed", {
        userId,
        query: q,
        resultCounts: {
            games: rankedGames.length,
            vaultGames: vaultGames.length,
            collectionGames: collectionGames.length,
            categories: categories.length,
            tags: tags.length,
            users: users.length,
        },
        durationMs: Date.now() - start,
    });

    return NextResponse.json({
        games: rankedGames.map((g) => ({
            id: g.id,
            appId: g.appId,
            name: g.name,
            type: g.type,
        })),
        vaultGames,
        collectionGames,
        categories,
        tags,
        users,
    });
}
