import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import prisma from "@/lib/prisma";

const DEFAULT_LOG_LIMIT = 25;
const DEFAULT_FAILED_LIMIT = 10;

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: jobId } = await params;
    const { searchParams } = new URL(req.url);
    const logPage = Math.max(1, parseInt(searchParams.get("logPage") ?? "1", 10));
    const logLimit = Math.min(
        100,
        Math.max(1, parseInt(searchParams.get("logLimit") ?? String(DEFAULT_LOG_LIMIT), 10)),
    );
    const failedPage = Math.max(1, parseInt(searchParams.get("failedPage") ?? "1", 10));
    const failedLimit = Math.min(
        50,
        Math.max(1, parseInt(searchParams.get("failedLimit") ?? String(DEFAULT_FAILED_LIMIT), 10)),
    );

    const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
            id: true,
            type: true,
            status: true,
            progress: true,
            processedItems: true,
            totalItems: true,
            failedItems: true,
            allItemsQueued: true,
            startedAt: true,
            finishedAt: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
            claimedBy: true,
            user: {
                select: {
                    id: true,
                    username: true,
                    avatarUrl: true,
                },
            },
        },
    });

    if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const [logs, failedChildJobs, logsCount, failedChildCount] = await Promise.all([
        prisma.jobLog.findMany({
            where: { jobId },
            orderBy: { timestamp: "desc" },
            skip: (logPage - 1) * logLimit,
            take: logLimit,
            select: {
                id: true,
                message: true,
                level: true,
                timestamp: true,
            },
        }),
        prisma.failedChildJob.findMany({
            where: { jobId },
            orderBy: { createdAt: "desc" },
            skip: (failedPage - 1) * failedLimit,
            take: failedLimit,
            select: {
                id: true,
                appId: true,
                gameId: true,
                errorMessage: true,
                attempts: true,
                createdAt: true,
            },
        }),
        prisma.jobLog.count({ where: { jobId } }),
        prisma.failedChildJob.count({ where: { jobId } }),
    ]);

    return NextResponse.json({
        ...job,
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        logs: logs.map((l) => ({ ...l, timestamp: l.timestamp.toISOString() })),
        logsPagination: {
            page: logPage,
            limit: logLimit,
            total: logsCount,
            pages: Math.max(1, Math.ceil(logsCount / logLimit)),
        },
        failedPagination: {
            page: failedPage,
            limit: failedLimit,
            total: failedChildCount,
            pages: Math.max(1, Math.ceil(failedChildCount / failedLimit)),
        },
        failedChildJobs: failedChildJobs.map((f) => ({
            ...f,
            createdAt: f.createdAt.toISOString(),
        })),
    });
}
