/**
 * Parent-job completion. Getting this wrong either leaves jobs stuck ACTIVE
 * forever, or marks them complete while children are still running.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, createLog } = vi.hoisted(() => {
    const job = { findUnique: vi.fn(), updateMany: vi.fn() };
    return {
        prismaMock: {
            job,
            // The transaction callback runs against the same mock models.
            $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ job })),
        },
        createLog: vi.fn(),
    };
});

vi.mock("@/src/lib/prisma.js", () => ({ default: prismaMock }));
vi.mock("@/src/lib/job/log.js", () => ({ createLog }));

vi.mock("@/src/lib/env.js", () => ({
    getWorkerEnv: () => ({ WORKER_GAME_DETAILS_REFRESH_DAYS: 30 }),
}));

vi.mock("@/src/lib/logger.js", () => {
    const child = () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => child(),
    });
    return { logger: { child } };
});

const ACTIVE = "ACTIVE";

function jobState(overrides: Record<string, unknown> = {}) {
    return {
        status: ACTIVE,
        processedItems: 10,
        failedItems: 0,
        totalItems: 10,
        allItemsQueued: true,
        ...overrides,
    };
}

beforeEach(() => {
    vi.resetModules();
    prismaMock.job.findUnique.mockReset().mockResolvedValue(jobState());
    prismaMock.job.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockClear();
    createLog.mockReset().mockResolvedValue(undefined);
});

async function completion() {
    return import("../completion.js");
}

describe("isStaleOrStub", () => {
    const now = Date.now();

    it("treats a game that has never been fetched as stale", async () => {
        const { isStaleOrStub } = await completion();

        expect(isStaleOrStub({ detailsFetchedAt: null, createdAt: new Date(now) })).toBe(true);
    });

    it("treats a recently fetched game as fresh", async () => {
        const { isStaleOrStub } = await completion();

        expect(
            isStaleOrStub({
                detailsFetchedAt: new Date(now - 60_000),
                createdAt: new Date(now),
            }),
        ).toBe(false);
    });

    it("honours the 24h freshness floor even below the refresh interval", async () => {
        const { isStaleOrStub } = await completion();

        // 12h old: inside the floor, so never re-fetched regardless of settings.
        expect(
            isStaleOrStub({
                detailsFetchedAt: new Date(now - 12 * 60 * 60 * 1_000),
                createdAt: new Date(now),
            }),
        ).toBe(false);
    });

    it("treats a game past the refresh window as stale", async () => {
        const { isStaleOrStub } = await completion();

        expect(
            isStaleOrStub({
                detailsFetchedAt: new Date(now - 31 * 24 * 60 * 60 * 1_000),
                createdAt: new Date(now),
            }),
        ).toBe(true);
    });

    it("keeps a game just inside the refresh window fresh", async () => {
        const { isStaleOrStub } = await completion();

        expect(
            isStaleOrStub({
                detailsFetchedAt: new Date(now - 29 * 24 * 60 * 60 * 1_000),
                createdAt: new Date(now),
            }),
        ).toBe(false);
    });
});

describe("tryCompleteParentJob", () => {
    it("marks a fully processed job COMPLETED", async () => {
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(prismaMock.job.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
        );
    });

    it("marks a job with failures PARTIALLY_COMPLETED", async () => {
        prismaMock.job.findUnique.mockResolvedValue(jobState({ processedItems: 8, failedItems: 2 }));
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(prismaMock.job.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_COMPLETED" }) }),
        );
    });

    it("does nothing while children are still outstanding", async () => {
        prismaMock.job.findUnique.mockResolvedValue(jobState({ processedItems: 5, failedItems: 0 }));
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(prismaMock.job.updateMany).not.toHaveBeenCalled();
    });

    it("waits until every item has been queued", async () => {
        // Without this guard a job completes the moment the first batch finishes,
        // before the rest of the catalog has even been enqueued.
        prismaMock.job.findUnique.mockResolvedValue(jobState({ allItemsQueued: false }));
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(prismaMock.job.updateMany).not.toHaveBeenCalled();
    });

    it("completes a job that had no items at all", async () => {
        prismaMock.job.findUnique.mockResolvedValue(jobState({ totalItems: 0, processedItems: 0 }));
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(prismaMock.job.updateMany).toHaveBeenCalled();
    });

    it("ignores a job that is not ACTIVE", async () => {
        prismaMock.job.findUnique.mockResolvedValue(jobState({ status: "COMPLETED" }));
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(prismaMock.job.updateMany).not.toHaveBeenCalled();
    });

    it("ignores a job that no longer exists", async () => {
        prismaMock.job.findUnique.mockResolvedValue(null);
        const { tryCompleteParentJob } = await completion();

        await expect(tryCompleteParentJob("job-1")).resolves.toBeUndefined();
        expect(prismaMock.job.updateMany).not.toHaveBeenCalled();
    });

    it("guards the status transition so two workers cannot both complete it", async () => {
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        // The compare-and-set on status is what makes the write idempotent.
        expect(prismaMock.job.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "job-1", status: ACTIVE } }),
        );
    });

    it("skips the completion log when another worker won the race", async () => {
        prismaMock.job.updateMany.mockResolvedValue({ count: 0 });
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(createLog).not.toHaveBeenCalled();
    });

    it("writes a summary log naming the outcome", async () => {
        prismaMock.job.findUnique.mockResolvedValue(jobState({ processedItems: 7, failedItems: 3 }));
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(createLog).toHaveBeenCalledWith(
            "job-1",
            "warn",
            expect.stringContaining("7 succeeded, 3 failed out of 10 total."),
        );
    });

    it("runs the whole evaluation inside one transaction", async () => {
        const { tryCompleteParentJob } = await completion();

        await tryCompleteParentJob("job-1");

        expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    });
});
