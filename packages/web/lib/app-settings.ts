import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import {AppSettingKey, KeyVaultAuthType} from "@/prisma/generated/enums";
import type { AppSettingValueType } from "@/types/app-setting";

/**
 * The subset of {@link AppSettingKey} values that are safe to expose to the browser.
 * Security-sensitive keys (brute-force thresholds, session timeouts) are intentionally
 * excluded.
 */
export const PUBLIC_SETTING_KEYS = [
    AppSettingKey.MAX_VAULTS_PER_USER,
    AppSettingKey.MAX_COLLECTIONS_PER_USER,
    AppSettingKey.UI_GAME_LIBRARY_PRERENDERED_ROWS,
    AppSettingKey.ALLOW_PUBLIC_COLLECTIONS,
    AppSettingKey.DISABLE_VAULT_SHARING,
    AppSettingKey.ADMIN_CAN_DELETE_ANY_VAULT,
    AppSettingKey.ADMIN_CAN_DELETE_ANY_COLLECTION,
    AppSettingKey.ADMIN_CAN_CHANGE_RESOURCE_OWNER,
    AppSettingKey.ALLOW_VAULT_DELETION,
    AppSettingKey.VAULT_PIN_MAX_LENGTH,
    AppSettingKey.VAULT_PIN_MIN_LENGTH,
    AppSettingKey.VAULT_PASSWORD_MAX_LENGTH,
    AppSettingKey.VAULT_PASSWORD_MIN_LENGTH,
    AppSettingKey.VAULT_AUTH_ALLOW_PIN,
    AppSettingKey.VAULT_AUTH_ALLOW_PASSWORD,
    AppSettingKey.VAULT_DEFAULT_AUTH_TYPE,
    AppSettingKey.VAULT_ALLOW_PASSWORD_CHANGE,
    AppSettingKey.ALLOW_INVITE_CODE_GENERATION,
    AppSettingKey.ALLOW_USER_ACCOUNT_DELETION
] as const satisfies readonly AppSettingKey[];

/** The type of settings that are safe to expose client-side. */
export type PublicAppSettings = Pick<AppSettingValueType, (typeof PUBLIC_SETTING_KEYS)[number]>;

const log = logger.child("server.services.appSettings");

const DEFAULTS: AppSettingValueType = {
    [AppSettingKey.ALLOW_USER_SIGNUP]: true,
    [AppSettingKey.ALLOW_USER_ACCOUNT_DELETION]: true,
    [AppSettingKey.ALLOW_INVITE_CODE_GENERATION]: false,
    [AppSettingKey.SESSION_TIMEOUT_SECONDS]: 12 * 60 * 60,
    [AppSettingKey.VAULT_ALLOW_PASSWORD_CHANGE]: true,
    [AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD]: true,
    [AppSettingKey.VAULT_BLOCK_DURATION_SECONDS]: 5 * 60,
    [AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS]: 3,
    [AppSettingKey.VAULT_DEFAULT_AUTH_TYPE]: KeyVaultAuthType.NONE,
    [AppSettingKey.VAULT_AUTH_ALLOW_PASSWORD]: true,
    [AppSettingKey.VAULT_AUTH_ALLOW_PIN]: true,
    [AppSettingKey.VAULT_PASSWORD_MIN_LENGTH]: 8,
    [AppSettingKey.VAULT_PASSWORD_MAX_LENGTH]: 16,
    [AppSettingKey.VAULT_PIN_MIN_LENGTH]: 4,
    [AppSettingKey.VAULT_PIN_MAX_LENGTH]: 8,
    [AppSettingKey.ALLOW_VAULT_DELETION]: true,
    [AppSettingKey.DISABLE_VAULT_SHARING]: false,
    [AppSettingKey.ADMIN_CAN_DELETE_ANY_VAULT]: false,
    [AppSettingKey.ADMIN_CAN_DELETE_ANY_COLLECTION]: false,
    [AppSettingKey.ADMIN_CAN_CHANGE_RESOURCE_OWNER]: true,
    [AppSettingKey.ALLOW_PUBLIC_COLLECTIONS]: true,
    [AppSettingKey.MAX_VAULTS_PER_USER]: 10,
    [AppSettingKey.MAX_COLLECTIONS_PER_USER]: 10,
    [AppSettingKey.UI_GAME_LIBRARY_PRERENDERED_ROWS]: 2,
};

type SettingsStore = Partial<AppSettingValueType>;

const g = globalThis as typeof globalThis & {
    __appSettings?: SettingsStore;
    __appSettingsLoaded?: boolean;
};

function assertSettingsLoaded(operation: string): void {
    if (g.__appSettingsLoaded) {
        return;
    }

    const error = new Error(
        `App settings are not loaded. Refusing to continue during ${operation}. Ensure loadSettings() completed during startup.`,
    );
    log.error("App settings accessed before load completed", error, { operation });
    throw error;
}

function store(): SettingsStore {
    if (!g.__appSettings) g.__appSettings = {};
    return g.__appSettings;
}

/**
 * Loads all settings rows from the database and merges them on top of {@link DEFAULTS}.
 * Called once at server startup via `instrumentation.ts`. Subsequent calls are no-ops
 * because the loaded flag is stored on `globalThis`, which survives Next.js HMR module
 * reloads in development and persists for the process lifetime in production.
 * Keys that are absent from the database retain their default value.
 *
 * @returns A promise that resolves when all settings have been loaded into memory.
 */
export async function loadSettings(): Promise<void> {
    if (g.__appSettingsLoaded) {
        log.debug("Settings already loaded — skipping");
        return;
    }

    log.info("Loading app settings from database");

    try {
        const rows = await prisma.appSetting.findMany();
        const hydrated: SettingsStore = { ...DEFAULTS };

        for (const row of rows) {
            const key = row.key as AppSettingKey;
            (hydrated as Record<string, unknown>)[key] =
                row.value as unknown as AppSettingValueType[typeof key];
        }

        g.__appSettings = hydrated;
        g.__appSettingsLoaded = true;

        log.info("App settings loaded into memory", {
            count: rows.length,
            keys: rows.map(r => r.key),
        });
    } catch (error) {
        g.__appSettings = undefined;
        g.__appSettingsLoaded = false;
        log.error("Failed to load app settings", error instanceof Error ? error : new Error(String(error)));
        throw error;
    }
}

/**
 * Returns the typed value for the given setting key.
 * Always resolves: if the in-memory store does not contain the key (e.g. before
 * {@link loadSettings} is called, or after {@link deleteSetting}), the corresponding
 * value from {@link DEFAULTS} is returned instead.
 *
 * @param key - The {@link AppSettingKey} whose value should be retrieved.
 * @returns The current typed value for the key, falling back to its default.
 */
export function getSetting<K extends AppSettingKey>(key: K): AppSettingValueType[K] {
    assertSettingsLoaded(`getSetting(${key})`);
    const value = store()[key];
    return (value !== undefined ? value : DEFAULTS[key]) as AppSettingValueType[K];
}

/**
 * Returns a full snapshot of all current settings with database values merged on top
 * of {@link DEFAULTS}. The returned object is a shallow copy — mutating it does not
 * affect the in-memory store.
 *
 * @returns A complete {@link AppSettingValueType} record containing every setting key.
 */
export function getAllSettings(): AppSettingValueType {
    assertSettingsLoaded("getAllSettings()");
    return { ...DEFAULTS, ...store() } as AppSettingValueType;
}

/**
 * Returns only the settings that are safe to expose to the browser (see {@link PUBLIC_SETTING_KEYS}).
 * Reads from the in-memory store, falling back to defaults for keys not yet loaded.
 *
 * @returns A {@link PublicAppSettings} record ready to be serialised and sent to the client.
 */
export function getPublicSettings(): PublicAppSettings {
    const all = getAllSettings();
    return Object.fromEntries(
        PUBLIC_SETTING_KEYS.map((key) => [key, all[key]]),
    ) as PublicAppSettings;
}

/**
 * Persists a single setting to the database using an upsert, then updates the
 * in-memory store. The database write is performed first; if it throws the
 * in-memory store is left unchanged.
 *
 * @param key - The {@link AppSettingKey} to create or update.
 * @param value - The new typed value to persist for the key.
 * @returns A promise that resolves when the upsert and memory update are complete.
 * @throws {Error} If the Prisma upsert fails (e.g. database unreachable).
 */
export async function upsertSetting<K extends AppSettingKey>(
    key: K,
    value: AppSettingValueType[K],
): Promise<void> {
    log.info("Upserting app setting", { key, value });

    await prisma.appSetting.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
    });

    (store() as Record<string, unknown>)[key] = value;
    log.info("App setting upserted and in-memory store updated", { key });
}

/**
 * Upserts multiple settings atomically in a single Prisma transaction, then flushes
 * all updated values into the in-memory store. If the transaction fails, no in-memory
 * values are changed.
 *
 * @param entries - A partial {@link AppSettingValueType} record whose keys and values
 *   should be created or updated.
 * @returns A promise that resolves when all upserts and memory updates are complete.
 * @throws {Error} If the Prisma transaction fails (e.g. database unreachable).
 */
export async function upsertSettings(
    entries: Partial<AppSettingValueType>,
): Promise<void> {
    const pairs = Object.entries(entries) as [
        AppSettingKey,
        AppSettingValueType[AppSettingKey],
    ][];

    log.info("Upserting multiple app settings in a transaction", {
        keys: pairs.map(([key]) => key),
    });

    await prisma.$transaction(
        pairs.map(([key, value]) =>
            prisma.appSetting.upsert({
                where: { key },
                update: { value: value as never },
                create: { key, value: value as never },
            }),
        ),
    );

    const s = store();
    for (const [key, value] of pairs) {
        (s as Record<string, unknown>)[key] = value;
    }
}

/**
 * Deletes a setting from the database and removes it from the in-memory store.
 * After deletion, {@link getSetting} will return the default value for that key.
 *
 * @param key - The {@link AppSettingKey} to delete.
 * @returns A promise that resolves when the record has been deleted and memory updated.
 * @throws {Error} If the Prisma delete fails (e.g. the key does not exist in the DB).
 */
export async function deleteSetting(key: AppSettingKey): Promise<void> {
    log.info("Deleting app setting", { key });
    await prisma.appSetting.delete({ where: { key } });
    delete store()[key];
}

/**
 * Wipes the in-memory settings cache and resets the loaded flag so that the next
 * call to {@link loadSettings} performs a fresh database read.
 * Useful after bulk external changes to the `AppSetting` table.
 *
 * @returns void
 */
export function invalidateSettingsCache(): void {
    log.info("Invalidate settings cache");
    g.__appSettings = undefined;
    g.__appSettingsLoaded = false;
}