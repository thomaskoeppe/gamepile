/**
 * Sync checkpoints let a long catalog walk resume after a crash instead of
 * restarting from the beginning. A checkpoint that fails to round-trip means a
 * restarted job silently re-processes everything.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock } = vi.hoisted(() => ({
    redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("@/src/lib/redis.js", () => ({ redis: redisMock }));

beforeEach(() => {
    vi.resetModules();
    redisMock.get.mockReset().mockResolvedValue(null);
    redisMock.set.mockReset().mockResolvedValue("OK");
    redisMock.del.mockReset().mockResolvedValue(1);
});

async function checkpoint() {
    return import("../checkpoint.js");
}

describe("readCheckpoint", () => {
    it("returns null when no checkpoint exists", async () => {
        const { readCheckpoint } = await checkpoint();

        expect(await readCheckpoint("job-1")).toBeNull();
    });

    it("deserialises a stored checkpoint", async () => {
        redisMock.get.mockResolvedValue(JSON.stringify({ cursor: "220", queuedItems: 50 }));
        const { readCheckpoint } = await checkpoint();

        expect(await readCheckpoint("job-1")).toEqual({ cursor: "220", queuedItems: 50 });
    });

    it("namespaces the key by job id so concurrent jobs cannot collide", async () => {
        const { readCheckpoint } = await checkpoint();

        await readCheckpoint("job-1");

        expect(redisMock.get).toHaveBeenCalledWith("checkpoint:sync:job-1");
    });
});

describe("writeCheckpoint", () => {
    it("persists with a TTL so an abandoned checkpoint expires", async () => {
        const { writeCheckpoint } = await checkpoint();

        await writeCheckpoint("job-1", { cursor: "440", queuedItems: 10 });

        const [key, value, mode, ttl] = redisMock.set.mock.calls[0];
        expect(key).toBe("checkpoint:sync:job-1");
        expect(JSON.parse(String(value))).toEqual({ cursor: "440", queuedItems: 10 });
        expect(mode).toBe("EX");
        expect(ttl).toBe(24 * 60 * 60);
    });

    it("round-trips through read", async () => {
        const { writeCheckpoint, readCheckpoint } = await checkpoint();

        await writeCheckpoint("job-1", { cursor: "570", queuedItems: 3 });
        redisMock.get.mockResolvedValue(redisMock.set.mock.calls[0][1]);

        expect(await readCheckpoint("job-1")).toEqual({ cursor: "570", queuedItems: 3 });
    });
});

describe("clearCheckpoint", () => {
    it("removes the checkpoint for the job", async () => {
        const { clearCheckpoint } = await checkpoint();

        await clearCheckpoint("job-1");

        expect(redisMock.del).toHaveBeenCalledWith("checkpoint:sync:job-1");
    });
});
