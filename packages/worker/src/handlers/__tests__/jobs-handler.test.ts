/**
 * Central dispatch for the jobs queue. A mis-route silently runs the wrong work
 * against a user's library; a missing guard lets a job run without the context
 * it requires.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
    importSteamLibrary: vi.fn(),
    importUserAchievements: vi.fn(),
    runInternalScheduledTask: vi.fn(),
    refreshGameDetails: vi.fn(),
    syncSteamCategories: vi.fn(),
    syncSteamGames: vi.fn(),
    syncSteamTags: vi.fn(),
    createLog: vi.fn(),
}));

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        job: { updateMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    },
}));

vi.mock("@/src/jobs/import-steam-library.js", () => ({ default: handlers.importSteamLibrary }));
vi.mock("@/src/jobs/import-user-achievements.js", () => ({ default: handlers.importUserAchievements }));
vi.mock("@/src/jobs/internal-scheduled-task.js", () => ({
    runInternalScheduledTask: handlers.runInternalScheduledTask,
}));
vi.mock("@/src/jobs/refresh-game-details.js", () => ({ default: handlers.refreshGameDetails }));
vi.mock("@/src/jobs/sync-steam-categories.js", () => ({ default: handlers.syncSteamCategories }));
vi.mock("@/src/jobs/sync-steam-games.js", () => ({ default: handlers.syncSteamGames }));
vi.mock("@/src/jobs/sync-steam-tags.js", () => ({ default: handlers.syncSteamTags }));
vi.mock("@/src/lib/job/log.js", () => ({ createLog: handlers.createLog }));
vi.mock("@/src/lib/prisma.js", () => ({ default: prismaMock }));

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

const JOB_ID = "job-1";

beforeEach(() => {
    vi.resetModules();
    Object.values(handlers).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
    prismaMock.job.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prismaMock.job.findFirst.mockReset().mockResolvedValue(null);
    prismaMock.job.findUnique.mockReset().mockResolvedValue(null);
});

async function dispatch(payload: Record<string, unknown>) {
    const { handleJobByType } = await import("../jobs-handler.js");
    return handleJobByType(payload as never);
}

describe("routing", () => {
    it("routes IMPORT_USER_LIBRARY with the user context", async () => {
        await dispatch({ type: "IMPORT_USER_LIBRARY", userId: "u1", resolvedJobId: JOB_ID });

        expect(handlers.importSteamLibrary).toHaveBeenCalledWith({ jobId: JOB_ID, userId: "u1" });
    });

    it("routes IMPORT_USER_ACHIEVEMENTS with the user context", async () => {
        await dispatch({ type: "IMPORT_USER_ACHIEVEMENTS", userId: "u1", resolvedJobId: JOB_ID });

        expect(handlers.importUserAchievements).toHaveBeenCalledWith({ jobId: JOB_ID, userId: "u1" });
    });

    it("routes SYNC_STEAM_GAMES", async () => {
        await dispatch({ type: "SYNC_STEAM_GAMES", resolvedJobId: JOB_ID });

        expect(handlers.syncSteamGames).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB_ID }));
    });

    it("routes REFRESH_GAME_DETAILS", async () => {
        await dispatch({ type: "REFRESH_GAME_DETAILS", resolvedJobId: JOB_ID });

        expect(handlers.refreshGameDetails).toHaveBeenCalledWith({ jobId: JOB_ID });
    });

    it.each([
        ["SYNC_STEAM_TAGS", "syncSteamTags"],
        ["SYNC_STEAM_CATEGORIES", "syncSteamCategories"],
    ] as const)("routes %s and completes it", async (type, handlerName) => {
        await dispatch({ type, resolvedJobId: JOB_ID });

        expect(handlers[handlerName]).toHaveBeenCalledWith({ jobId: JOB_ID });
        expect(prismaMock.job.updateMany).toHaveBeenCalled();
    });

    it("routes INTERNAL_SCHEDULED_TASK when the scheduler enqueued it", async () => {
        await dispatch({ type: "INTERNAL_SCHEDULED_TASK", internalScheduler: true, resolvedJobId: JOB_ID });

        expect(handlers.runInternalScheduledTask).toHaveBeenCalledWith({ jobId: JOB_ID });
    });

    it("dispatches exactly one handler per job", async () => {
        await dispatch({ type: "SYNC_STEAM_TAGS", resolvedJobId: JOB_ID });

        expect(handlers.syncSteamGames).not.toHaveBeenCalled();
        expect(handlers.importSteamLibrary).not.toHaveBeenCalled();
        expect(handlers.refreshGameDetails).not.toHaveBeenCalled();
    });
});

describe("required context", () => {
    it.each(["IMPORT_USER_LIBRARY", "IMPORT_USER_ACHIEVEMENTS"])("refuses %s without a userId", async (type) => {
        await expect(dispatch({ type, resolvedJobId: JOB_ID })).rejects.toThrow(/userId/);
    });

    it("refuses an INTERNAL_SCHEDULED_TASK that did not come from the scheduler", async () => {
        // Guards against a user-triggerable path into internal maintenance work.
        await expect(dispatch({ type: "INTERNAL_SCHEDULED_TASK", resolvedJobId: JOB_ID })).rejects.toThrow(
            /only be enqueued by the scheduler/,
        );

        expect(handlers.runInternalScheduledTask).not.toHaveBeenCalled();
    });

    it("raises UnhandledJobTypeError for an unknown type", async () => {
        await expect(dispatch({ type: "SOMETHING_NEW", resolvedJobId: JOB_ID })).rejects.toThrow(/Unhandled job type/);
    });
});

describe("completion", () => {
    it("only completes a job that is still ACTIVE", async () => {
        await dispatch({ type: "SYNC_STEAM_TAGS", resolvedJobId: JOB_ID });

        // A job cancelled mid-run must not be resurrected into COMPLETED.
        expect(prismaMock.job.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: JOB_ID, status: "ACTIVE" } }),
        );
    });

    it("skips the success log when the job was no longer ACTIVE", async () => {
        prismaMock.job.updateMany.mockResolvedValue({ count: 0 });

        await dispatch({ type: "SYNC_STEAM_TAGS", resolvedJobId: JOB_ID });

        expect(handlers.createLog).not.toHaveBeenCalled();
    });

    it("writes a success log when it completed the job", async () => {
        await dispatch({ type: "SYNC_STEAM_CATEGORIES", resolvedJobId: JOB_ID });

        expect(handlers.createLog).toHaveBeenCalledWith(JOB_ID, "info", expect.stringContaining("completed"));
    });

    it("does not complete job types that own their own completion", async () => {
        await dispatch({ type: "IMPORT_USER_LIBRARY", userId: "u1", resolvedJobId: JOB_ID });

        expect(prismaMock.job.updateMany).not.toHaveBeenCalled();
    });
});

describe("handler failures", () => {
    it("propagates a handler error so BullMQ can retry", async () => {
        handlers.syncSteamGames.mockRejectedValue(new Error("Steam unavailable"));

        await expect(dispatch({ type: "SYNC_STEAM_GAMES", resolvedJobId: JOB_ID })).rejects.toThrow(
            "Steam unavailable",
        );
    });

    it("does not mark a job complete when its handler threw", async () => {
        handlers.syncSteamTags.mockRejectedValue(new Error("boom"));

        await expect(dispatch({ type: "SYNC_STEAM_TAGS", resolvedJobId: JOB_ID })).rejects.toThrow();
        expect(prismaMock.job.updateMany).not.toHaveBeenCalled();
    });
});
