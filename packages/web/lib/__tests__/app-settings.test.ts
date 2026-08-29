/**
 * Regression tests for the deployment failure: a cold settings store used to
 * throw out of the root layout, which Next.js could not render around, producing
 * a bare `text/plain` "Internal Server Error" for every request until restart.
 *
 * These tests fail against the pre-fix implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const upsert = vi.fn();
const deleteOne = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
    default: {
        appSetting: {
            get findMany() { return findMany; },
            get upsert() { return upsert; },
            get delete() { return deleteOne; },
        },
        get $transaction() { return transaction; },
    },
}));

vi.mock("@/lib/logger", () => {
    const child = () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => child(),
    });
    return { logger: { child } };
});

type SettingsGlobal = typeof globalThis & {
    __appSettings?: unknown;
    __appSettingsLoaded?: boolean;
    __appSettingsLoading?: Promise<void>;
    __appSettingsWarned?: boolean;
};

const g = globalThis as SettingsGlobal;

function resetSettingsGlobals(): void {
    g.__appSettings = undefined;
    g.__appSettingsLoaded = undefined;
    g.__appSettingsLoading = undefined;
    g.__appSettingsWarned = undefined;
}

async function importSettings() {
    vi.resetModules();
    return import("@/lib/app-settings");
}

beforeEach(() => {
    resetSettingsGlobals();
    findMany.mockReset();
    upsert.mockReset().mockResolvedValue({});
    deleteOne.mockReset().mockResolvedValue({});
    transaction.mockReset().mockResolvedValue([]);
});

afterEach(() => {
    resetSettingsGlobals();
});

describe("reads on a cold store", () => {
    it("returns defaults instead of throwing", async () => {
        const { getSetting, getAllSettings, getPublicSettings } = await importSettings();
        findMany.mockResolvedValue([]);

        // The pre-fix implementation threw from all three of these.
        expect(() => getSetting("MAX_VAULTS_PER_USER" as never)).not.toThrow();
        expect(() => getAllSettings()).not.toThrow();
        expect(() => getPublicSettings()).not.toThrow();

        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(10);
    });

    it("exposes only the public keys through getPublicSettings", async () => {
        const { getPublicSettings, PUBLIC_SETTING_KEYS } = await importSettings();
        findMany.mockResolvedValue([]);

        const settings = getPublicSettings();

        expect(Object.keys(settings).sort()).toEqual([...PUBLIC_SETTING_KEYS].sort());
        // Security-sensitive keys must never leak to the browser.
        expect(settings).not.toHaveProperty("SESSION_TIMEOUT_SECONDS");
        expect(settings).not.toHaveProperty("VAULT_BLOCK_AFTER_ATTEMPTS");
    });
});

describe("loadSettings", () => {
    it("hydrates database values on top of defaults", async () => {
        const { loadSettings, getSetting, areSettingsLoaded } = await importSettings();
        findMany.mockResolvedValue([{ key: "MAX_VAULTS_PER_USER", value: 42 }]);

        await loadSettings();

        expect(areSettingsLoaded()).toBe(true);
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(42);
        // Untouched keys keep their default.
        expect(getSetting("MAX_COLLECTIONS_PER_USER" as never)).toBe(10);
    });

    it("keeps previously loaded settings when a reload fails", async () => {
        const { loadSettings, getSetting, areSettingsLoaded } = await importSettings();

        findMany.mockResolvedValueOnce([{ key: "MAX_VAULTS_PER_USER", value: 99 }]);
        await loadSettings();
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(99);

        findMany.mockRejectedValueOnce(new Error("connection pool exhausted"));
        await expect(loadSettings({ force: true })).rejects.toThrow("connection pool exhausted");

        // This is the core regression: the failed reload used to wipe the cache,
        // permanently 500-ing every request until the container was restarted.
        expect(areSettingsLoaded()).toBe(true);
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(99);
    });

    it("skips redundant reads unless forced", async () => {
        const { loadSettings } = await importSettings();
        findMany.mockResolvedValue([]);

        await loadSettings();
        await loadSettings();
        expect(findMany).toHaveBeenCalledTimes(1);

        await loadSettings({ force: true });
        expect(findMany).toHaveBeenCalledTimes(2);
    });
});

describe("ensureSettingsLoaded", () => {
    it("never rejects when the database is unreachable", async () => {
        const { ensureSettingsLoaded, areSettingsLoaded, getSetting } = await importSettings();
        findMany.mockRejectedValue(new Error("ECONNREFUSED"));

        // A request path awaits this; a rejection here would be a 500.
        await expect(ensureSettingsLoaded()).resolves.toBeUndefined();
        expect(areSettingsLoaded()).toBe(false);
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(10);
    });

    it("de-duplicates concurrent callers onto a single database read", async () => {
        const { ensureSettingsLoaded } = await importSettings();

        let release: (rows: unknown[]) => void = () => {};
        findMany.mockImplementation(
            () => new Promise((resolve) => { release = resolve as (rows: unknown[]) => void; }),
        );

        const all = Promise.all([
            ensureSettingsLoaded(),
            ensureSettingsLoaded(),
            ensureSettingsLoaded(),
        ]);

        release([]);
        await all;

        // Without de-duplication a burst of traffic on a cold store would open
        // one connection per in-flight request.
        expect(findMany).toHaveBeenCalledTimes(1);
    });

    it("recovers on a later attempt after an outage", async () => {
        const { ensureSettingsLoaded, areSettingsLoaded, getSetting } = await importSettings();

        findMany.mockRejectedValueOnce(new Error("database starting up"));
        await ensureSettingsLoaded();
        expect(areSettingsLoaded()).toBe(false);

        findMany.mockResolvedValueOnce([{ key: "MAX_VAULTS_PER_USER", value: 7 }]);
        await ensureSettingsLoaded();

        // Self-healing without a restart is the behaviour change that fixes the
        // reported production failure.
        expect(areSettingsLoaded()).toBe(true);
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(7);
    });
});

describe("mutations", () => {
    it("persists before updating memory, so a failed write is not reflected", async () => {
        const { loadSettings, upsertSetting, getSetting } = await importSettings();
        findMany.mockResolvedValue([]);
        await loadSettings();

        upsert.mockRejectedValueOnce(new Error("read-only transaction"));
        await expect(upsertSetting("MAX_VAULTS_PER_USER" as never, 55 as never)).rejects.toThrow();

        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(10);
    });

    it("updates the in-memory store after a successful upsert", async () => {
        const { loadSettings, upsertSetting, getSetting } = await importSettings();
        findMany.mockResolvedValue([]);
        await loadSettings();

        await upsertSetting("MAX_VAULTS_PER_USER" as never, 55 as never);

        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { key: "MAX_VAULTS_PER_USER" } }),
        );
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(55);
    });

    it("writes a batch inside a single transaction", async () => {
        const { loadSettings, upsertSettings, getSetting } = await importSettings();
        findMany.mockResolvedValue([]);
        await loadSettings();

        await upsertSettings({
            MAX_VAULTS_PER_USER: 3,
            MAX_COLLECTIONS_PER_USER: 4,
        } as never);

        // Atomicity matters: a partial write would leave the UI inconsistent.
        expect(transaction).toHaveBeenCalledOnce();
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(3);
        expect(getSetting("MAX_COLLECTIONS_PER_USER" as never)).toBe(4);
    });

    it("leaves memory untouched when the batch transaction fails", async () => {
        const { loadSettings, upsertSettings, getSetting } = await importSettings();
        findMany.mockResolvedValue([]);
        await loadSettings();

        transaction.mockRejectedValueOnce(new Error("deadlock detected"));
        await expect(upsertSettings({ MAX_VAULTS_PER_USER: 3 } as never)).rejects.toThrow();

        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(10);
    });

    it("falls back to the default after a setting is deleted", async () => {
        const { loadSettings, deleteSetting, getSetting } = await importSettings();
        findMany.mockResolvedValue([{ key: "MAX_VAULTS_PER_USER", value: 77 }]);
        await loadSettings();
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(77);

        await deleteSetting("MAX_VAULTS_PER_USER" as never);

        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(10);
    });

    it("invalidateSettingsCache drops to defaults without throwing on later reads", async () => {
        const { loadSettings, invalidateSettingsCache, getSetting, areSettingsLoaded } = await importSettings();
        findMany.mockResolvedValue([{ key: "MAX_VAULTS_PER_USER", value: 88 }]);
        await loadSettings();

        invalidateSettingsCache();

        expect(areSettingsLoaded()).toBe(false);
        // Even fully invalidated, reads must degrade rather than throw.
        expect(() => getSetting("MAX_VAULTS_PER_USER" as never)).not.toThrow();
        expect(getSetting("MAX_VAULTS_PER_USER" as never)).toBe(10);
    });
});
