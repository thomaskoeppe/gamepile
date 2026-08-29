/**
 * Persistence for synced Steam games, and the counters the parent job uses to
 * decide when it is done. If failures are not recorded, a partial Steam outage
 * reports as a clean run and the missing games are never retried.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, createLog } = vi.hoisted(() => {
    const model = () => ({
        create: vi.fn(),
        createMany: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
    });
    return {
        prismaMock: {
            game: model(),
            job: model(),
            failedChildJob: model(),
            category: model(),
            tag: model(),
            gameScreenshot: model(),
            gameVideo: model(),
            $transaction: vi.fn(),
        },
        createLog: vi.fn(),
    };
});

vi.mock("@/src/lib/prisma.js", () => ({ default: prismaMock }));
vi.mock("@/src/lib/job/log.js", () => ({ createLog }));
vi.mock("@/src/lib/steam/cache/category-cache.js", () => ({
    getAllCategories: vi.fn().mockResolvedValue([]),
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

function details(overrides: Record<string, unknown> = {}) {
    return {
        appId: 220,
        name: "Half-Life 2",
        type: "GAME",
        isFree: false,
        isEarlyAccess: false,
        shortDescription: null,
        fullDescription: null,
        developers: ["Valve"],
        publishers: ["Valve"],
        franchises: [],
        releaseDate: new Date("2004-11-16"),
        platforms: ["WINDOWS"],
        tagIds: [],
        tagNames: [],
        categoryIds: [],
        reviewScore: null,
        reviewPercentage: null,
        reviewCount: null,
        reviewScoreLabel: null,
        headerImageUrl: null,
        capsuleImageUrl: null,
        libraryCapsuleUrl: null,
        libraryHeroUrl: null,
        heroCapsuleUrl: null,
        steamDeckCompat: null,
        detailsFetchedAt: new Date(),
        screenshotUrls: [],
        trailers: [],
        ...overrides,
    } as never;
}

beforeEach(() => {
    vi.resetModules();
    for (const model of Object.values(prismaMock)) {
        if (typeof model === "function") continue;
        for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
    }
    prismaMock.game.upsert.mockResolvedValue({ id: "g1" });
    prismaMock.game.update.mockResolvedValue({ id: "g1" });
    prismaMock.game.findUnique.mockResolvedValue({ id: "g1" });
    prismaMock.$transaction.mockReset().mockResolvedValue([[], []]);
    createLog.mockReset().mockResolvedValue(undefined);
});

async function persistence() {
    return import("../game-persistence.js");
}

describe("recordChildFailure", () => {
    it("records the failure against the parent job", async () => {
        const { recordChildFailure } = await persistence();

        await recordChildFailure("job-1", 220, "g1", "Steam timed out", 3);

        expect(prismaMock.failedChildJob.create).toHaveBeenCalledWith({
            data: { jobId: "job-1", appId: 220, gameId: "g1", errorMessage: "Steam timed out", attempts: 3 },
        });
    });

    it("increments failedItems so the parent can settle as PARTIALLY_COMPLETED", async () => {
        const { recordChildFailure } = await persistence();

        await recordChildFailure("job-1", 220, undefined, "boom", 1);

        // Without this the parent waits forever for items that will never arrive.
        expect(prismaMock.job.update).toHaveBeenCalledWith({
            where: { id: "job-1" },
            data: { failedItems: { increment: 1 } },
        });
    });

    it("writes a job log naming the app and attempt count", async () => {
        const { recordChildFailure } = await persistence();

        await recordChildFailure("job-1", 220, undefined, "Steam timed out", 3);

        expect(createLog).toHaveBeenCalledWith(
            "job-1",
            "warn",
            expect.stringContaining("appId=220 permanently failed after 3 attempt(s)"),
        );
    });

    it("tolerates a failure with no known gameId", async () => {
        const { recordChildFailure } = await persistence();

        await expect(recordChildFailure("job-1", 999, undefined, "not found", 1)).resolves.toBeUndefined();
    });
});

describe("incrementProcessedItems", () => {
    it("advances the parent counter by the batch size", async () => {
        const { incrementProcessedItems } = await persistence();

        await incrementProcessedItems("job-1", 50);

        expect(prismaMock.job.update).toHaveBeenCalledWith({
            where: { id: "job-1" },
            data: { processedItems: { increment: 50 } },
        });
    });

    it("handles a zero-sized batch without erroring", async () => {
        const { incrementProcessedItems } = await persistence();

        await expect(incrementProcessedItems("job-1", 0)).resolves.toBeUndefined();
    });
});

describe("createGameStub", () => {
    it("upserts by appId when no game row is known", async () => {
        const { createGameStub } = await persistence();

        await createGameStub(220, undefined);

        expect(prismaMock.game.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { appId: 220 } }));
    });

    it("updates in place when the game row exists", async () => {
        const { createGameStub } = await persistence();

        await createGameStub(220, "g1");

        expect(prismaMock.game.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "g1" } }));
        expect(prismaMock.game.upsert).not.toHaveBeenCalled();
    });

    it("falls back to upsert when the referenced game row has been deleted", async () => {
        prismaMock.game.findUnique.mockResolvedValue(null);
        const { createGameStub } = await persistence();

        await createGameStub(220, "stale-id");

        // A stale gameId would otherwise throw a Prisma "record not found".
        expect(prismaMock.game.upsert).toHaveBeenCalled();
        expect(prismaMock.game.update).not.toHaveBeenCalled();
    });

    it("names the stub after its appId so it is identifiable before details arrive", async () => {
        const { createGameStub } = await persistence();

        await createGameStub(220, undefined);

        expect(prismaMock.game.upsert.mock.calls[0][0].create).toMatchObject({
            name: "App 220",
            type: "UNKNOWN",
            appId: 220,
        });
    });
});

describe("persistGameDetails", () => {
    it("upserts by appId when the game is not yet known", async () => {
        const { persistGameDetails } = await persistence();

        await persistGameDetails(details(), undefined);

        expect(prismaMock.game.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { appId: 220 } }));
    });

    it("writes the mapped Steam fields onto the row", async () => {
        const { persistGameDetails } = await persistence();

        await persistGameDetails(details({ name: "Portal 2", isFree: true }), undefined);

        expect(prismaMock.game.upsert.mock.calls[0][0].update).toMatchObject({
            name: "Portal 2",
            isFree: true,
            developers: ["Valve"],
        });
    });

    it("skips category and tag lookups when the game has none", async () => {
        const { persistGameDetails } = await persistence();

        await persistGameDetails(details({ categoryIds: [], tagIds: [] }), undefined);

        expect(prismaMock.category.createMany).not.toHaveBeenCalled();
        expect(prismaMock.tag.createMany).not.toHaveBeenCalled();
    });

    it("creates missing tags before linking them", async () => {
        prismaMock.tag.findMany.mockResolvedValue([]);
        const { persistGameDetails } = await persistence();

        await persistGameDetails(details({ tagIds: [1, 2], tagNames: ["Action", "Indie"] }), undefined);

        expect(prismaMock.tag.createMany).toHaveBeenCalled();
    });

    it("persists a game whose optional fields are all null", async () => {
        const { persistGameDetails } = await persistence();

        // This is the shape a heavily stripped Steam payload maps to.
        await expect(persistGameDetails(details({ releaseDate: null }), undefined)).resolves.toBeUndefined();
        expect(prismaMock.game.upsert).toHaveBeenCalled();
    });
});
