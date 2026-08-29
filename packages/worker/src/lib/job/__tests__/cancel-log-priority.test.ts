/**
 * Cooperative cancellation, job logging and queue priorities — small modules
 * that every long-running sync depends on.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock, prismaMock } = vi.hoisted(() => ({
    redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
    prismaMock: { jobLog: { create: vi.fn() } },
}));

vi.mock("@/src/lib/redis.js", () => ({ redis: redisMock }));
vi.mock("@/src/lib/prisma.js", () => ({ default: prismaMock }));

beforeEach(() => {
    vi.resetModules();
    redisMock.get.mockReset().mockResolvedValue(null);
    redisMock.set.mockReset().mockResolvedValue("OK");
    redisMock.del.mockReset().mockResolvedValue(1);
    prismaMock.jobLog.create.mockReset().mockResolvedValue({ id: "l1" });
});

describe("cancellation flag", () => {
    async function cancel() {
        return import("../cancel.js");
    }

    it("reports a job as not cancelled by default", async () => {
        const { isJobCancelled } = await cancel();

        expect(await isJobCancelled("job-1")).toBe(false);
    });

    it("reports a job as cancelled once flagged", async () => {
        redisMock.get.mockResolvedValue("1");
        const { isJobCancelled } = await cancel();

        expect(await isJobCancelled("job-1")).toBe(true);
    });

    it.each(["0", "", "true", "yes", null])("treats the flag value %s as not cancelled", async (value) => {
        redisMock.get.mockResolvedValue(value);
        const { isJobCancelled } = await cancel();

        // Only an exact "1" cancels; a stray value must not abort a healthy sync.
        expect(await isJobCancelled("job-1")).toBe(false);
    });

    it("namespaces the flag per job", async () => {
        const { isJobCancelled } = await cancel();

        await isJobCancelled("job-1");

        expect(redisMock.get).toHaveBeenCalledWith("cancel:parent:job-1");
    });

    it("sets the flag with a TTL so it self-cleans", async () => {
        const { flagJobCancelled } = await cancel();

        await flagJobCancelled("job-1");

        // A permanent flag would silently cancel a future job reusing the id.
        expect(redisMock.set).toHaveBeenCalledWith("cancel:parent:job-1", "1", "EX", 2 * 60 * 60);
    });

    it("round-trips flag then check", async () => {
        const { flagJobCancelled, isJobCancelled } = await cancel();

        await flagJobCancelled("job-1");
        redisMock.get.mockResolvedValue(redisMock.set.mock.calls[0][1]);

        expect(await isJobCancelled("job-1")).toBe(true);
    });
});

describe("createLog", () => {
    it.each(["info", "warn", "error", "success"] as const)("records a %s entry", async (level) => {
        const { createLog } = await import("../log.js");

        await createLog("job-1", level, "something happened");

        expect(prismaMock.jobLog.create).toHaveBeenCalledWith({
            data: { jobId: "job-1", level, message: "something happened" },
        });
    });

    it("stores the message verbatim, including newlines from an upstream error", async () => {
        const { createLog } = await import("../log.js");

        await createLog("job-1", "error", "line one\nline two");

        expect(prismaMock.jobLog.create.mock.calls[0][0].data.message).toBe("line one\nline two");
    });
});

describe("PRIORITY", () => {
    it("orders user-initiated work ahead of background sync", async () => {
        const { PRIORITY } = await import("../priority.js");

        // BullMQ treats a lower number as higher priority.
        expect(PRIORITY.HIGH).toBeLessThan(PRIORITY.NORMAL);
        expect(PRIORITY.NORMAL).toBeLessThan(PRIORITY.LOW);
    });

    it("exposes the three documented levels", async () => {
        const { PRIORITY } = await import("../priority.js");

        expect(PRIORITY).toEqual({ HIGH: 1, NORMAL: 5, LOW: 10 });
    });
});
