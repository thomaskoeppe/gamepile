import { NextResponse } from "next/server";

import { formatSessionForClient,getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

export async function GET() {
    const log = logger.child("api.routes.session:get");
    const start = Date.now();

    try {
        log.debug("Session fetch started");
        const sessionData = await getCurrentSession();

        if (!sessionData) {
            log.debug("No active session found", { durationMs: Date.now() - start });
            return NextResponse.json(
                { authenticated: false, user: null, session: null },
                { status: 200 }
            );
        }

        const { user, session } = sessionData;

        const activeSessions = await prisma.session.findMany({
            where: { userId: user.id },
            orderBy: { lastActivity: "desc" },
        });

        log.info("Session fetch completed", {
            userId: user.id,
            username: user.username,
            activeSessionCount: activeSessions.length,
            durationMs: Date.now() - start,
        });

        return NextResponse.json({
            authenticated: true,
            user: {
                id: user.id,
                steamId: user.steamId,
                username: user.username,
                avatarUrl: user.avatarUrl,
                profileUrl: user.profileUrl,
                createdAt: user.createdAt,
                role: user.role,
            },
            session: formatSessionForClient(session),
            activeSessions: activeSessions.map(formatSessionForClient),
        });
    } catch (error) {
        log.error("Session fetch error", error instanceof Error ? error : new Error(String(error)), {
            durationMs: Date.now() - start,
        });
        return NextResponse.json(
            { authenticated: false, error: "Failed to fetch session" },
            { status: 500 }
        );
    }
}
