import type {AppSettingKey} from "@/src/prisma/generated/enums.js";

import {logger} from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";

const log = logger.child("worker.lib:appSettings");

/**
 * Reads a numeric application setting from the `AppSetting` table.
 *
 * Settings are managed by admins through the web UI and read fresh from the
 * database at execution time, so changes take effect without a worker
 * restart. Returns `fallback` when the row is absent (defaults are seeded
 * lazily by the web app) or the stored value is not a finite positive number.
 *
 * @param key - The {@link AppSettingKey} to read.
 * @param fallback - Value used when the setting is missing or invalid.
 * @returns The configured number, or `fallback`.
 */
export async function getNumberAppSetting(key: AppSettingKey, fallback: number): Promise<number> {
    try {
        const row = await prisma.appSetting.findUnique({where: {key}, select: {value: true}});
        const value = row?.value;

        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value;
        }

        if (row !== null && value !== undefined) {
            log.warn("App setting has a non-numeric or non-positive value — using fallback", {
                key, value, fallback,
            });
        }

        return fallback;
    } catch (err) {
        log.error("Failed to read app setting — using fallback",
            err instanceof Error ? err : new Error(String(err)), {key, fallback});
        return fallback;
    }
}
