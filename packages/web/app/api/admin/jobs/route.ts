import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { JobStatus, JobType } from "@/prisma/generated/enums";

export async function GET(request: NextRequest) {
    const log = logger.child("api.routes.admin.jobs:list");
    const start = Date.now();

    try {
        await requireAdmin();
    } catch {
        log.warn("Admin jobs access denied", { durationMs: Date.now() - start });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
    const statusFilter = searchParams.get("status") as JobStatus | null;
    const typeFilter = searchParams.get("type") as JobType | null;

    log.info("Fetching admin jobs", { page, limit, statusFilter, typeFilter });

    const where = {
        ...(statusFilter && Object.values(JobStatus).includes(statusFilter) ? { status: statusFilter } : {}),
        ...(typeFilter && Object.values(JobType).includes(typeFilter) ? { type: typeFilter } : {}),
    };

    const [jobs, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
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
                _count: {
                    select: {
                        logs: true,
                        FailedChildJob: true,
                    },
                },
            },
        }),
        prisma.job.count({ where }),
    ]);

    log.info("Admin jobs fetched", { durationMs: Date.now() - start, total });

    return NextResponse.json({
        jobs,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    });
}
