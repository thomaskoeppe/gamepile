/**
 * Bulk stub upserts run over the entire Steam catalog (200k+ apps), so the
 * chunking here is what keeps the sync inside PostgreSQL's parameter limit.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        $executeRaw: vi.fn(),
        game: { findMany: vi.fn() },
    },
}));

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

function stubs(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        appId: 1000 + i,
        name: `App ${1000 + i}`,
        steamLastModified: 1_700_000_000 + i,
    }));
}

beforeEach(() => {
    vi.resetModules();
    prismaMock.$executeRaw.mockReset().mockResolvedValue(1);
    prismaMock.game.findMany.mockReset().mockResolvedValue([]);
});

async function helper() {
    return import("../helper.js");
}

describe("upsertGameStubs", () => {
    it("issues a single statement for a small batch", async () => {
        const { upsertGameStubs } = await helper();

        await upsertGameStubs(stubs(10));

        expect(prismaMock.$executeRaw).toHaveBeenCalledOnce();
    });

    it("chunks a large batch into several statements", async () => {
        const { upsertGameStubs } = await helper();

        await upsertGameStubs(stubs(2_500));

        // One oversized statement would blow PostgreSQL's bind-parameter limit.
        expect(prismaMock.$executeRaw.mock.calls.length).toBeGreaterThan(1);
    });

    it("issues no statement for an empty batch", async () => {
        const { upsertGameStubs } = await helper();

        await upsertGameStubs([]);

        expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it("only rewrites rows whose steamLastModified actually changed", async () => {
        const { upsertGameStubs } = await helper();

        await upsertGameStubs(stubs(1));
        const sql = prismaMock.$executeRaw.mock.calls[0][0];
        const text = Array.isArray(sql) ? sql.join("?") : String(sql);

        // Without the IS DISTINCT FROM guard every sync rewrites the whole table.
        expect(text).toContain("ON CONFLICT");
        expect(text).toContain("IS DISTINCT FROM");
    });
});

describe("getConnectedGameIds", () => {
    it("returns an empty set without querying for an empty input", async () => {
        const { getConnectedGameIds } = await helper();

        expect(await getConnectedGameIds([])).toEqual(new Set());
        expect(prismaMock.game.findMany).not.toHaveBeenCalled();
    });

    it("returns only the ids that have a connection", async () => {
        prismaMock.game.findMany.mockResolvedValue([{ id: "g1" }, { id: "g3" }]);
        const { getConnectedGameIds } = await helper();

        expect(await getConnectedGameIds(["g1", "g2", "g3"])).toEqual(new Set(["g1", "g3"]));
    });

    it("counts a game connected through a library, collection or vault", async () => {
        const { getConnectedGameIds } = await helper();

        await getConnectedGameIds(["g1"]);
        const where = prismaMock.game.findMany.mock.calls[0][0].where;

        expect(where.OR).toHaveLength(3);
        expect(JSON.stringify(where.OR)).toMatch(/userGames.*collectionGames.*keyVaultGames/);
    });

    it("returns an empty set when nothing is connected", async () => {
        const { getConnectedGameIds } = await helper();

        expect(await getConnectedGameIds(["g1", "g2"])).toEqual(new Set());
    });
});
