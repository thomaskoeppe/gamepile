import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { createPollingSseStream, SSE_HEADERS, sseEvent } from "@/lib/sse";
import { isTerminal, JobSnapshot } from "@/types/job";

const POLL_INTERVAL_MS = 2_000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const LOG_TAIL = 20;

async function fetchSnapshot(jobId: string, userId: string): Promise<JobSnapshot | null> {
    const job = await prisma.job.findUnique({
        where: {
            id: jobId,
            userId,
        },
        select: {
            id: true,
            type: true,
            status: true,
            processedItems: true,
            totalItems: true,
            failedItems: true,
            allItemsQueued: true,
            startedAt: true,
            finishedAt: true,
            errorMessage: true,
            createdAt: true,
            logs: {
                orderBy: { timestamp: "desc" },
                take: LOG_TAIL,
                select: {
                    id: true,
                    message: true,
                    level: true,
                    timestamp: true,
                },
            },
        },
    });

    if (!job) return null;

    return {
        ...job,
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        logs: job.logs.reverse().map((l) => ({ ...l, timestamp: l.timestamp.toISOString() })),
    };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const log = logger.child("api.routes.jobs:statusStream", {
        requestId: req.headers.get("x-request-id") ?? undefined,
    });
    const { id: jobId } = await params;

    const session = await getCurrentSession();
    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;

    const stream = createPollingSseStream({
        signal: req.signal,
        pollIntervalMs: POLL_INTERVAL_MS,
        keepAliveIntervalMs: KEEPALIVE_INTERVAL_MS,
        async poll({ send, close }) {
            let snapshot: JobSnapshot | null;

            try {
                snapshot = await fetchSnapshot(jobId, userId);
            } catch {
                log.error("SSE snapshot poll failed", undefined, {
                    jobId,
                    userId,
                });
                return;
            }

            if (!snapshot) {
                send(sseEvent("error", { message: "Job not found or access denied" }));
                close();
                return;
            }

            send(sseEvent("snapshot", snapshot));

            if (isTerminal(snapshot.status)) {
                send(sseEvent("done", { status: snapshot.status }));
                close();
            }
        },
        onClose(reason) {
            log.debug("Job status stream closed", { jobId, userId, reason });
        },
    });

    return new Response(stream, { headers: SSE_HEADERS });
}
