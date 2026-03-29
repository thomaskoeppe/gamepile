"use server";

import { z } from "zod";

import { invalidateSettingsCache, loadSettings, upsertSetting, upsertSettings } from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import {jobsQueue} from "@/lib/queue";
import { withLogging } from "@/lib/with-logging";
import {AppSettingKey, JobType, KeyVaultAuthType} from "@/prisma/generated/enums";
import { actionClientWithAdmin } from "@/server/actions";
import type { AppSettingValueType } from "@/types/app-setting";

/**
 * Maps every AppSettingKey to the JS primitive type expected for its value.
 * Used at runtime to validate the generic updateSetting action.
 */
const SETTING_TYPES: Record<AppSettingKey, "boolean" | "number" | "string"> = {
    [AppSettingKey.ALLOW_USER_SIGNUP]: "boolean",
    [AppSettingKey.ALLOW_USER_ACCOUNT_DELETION]: "boolean",
    [AppSettingKey.ALLOW_INVITE_CODE_GENERATION]: "boolean",
    [AppSettingKey.SESSION_TIMEOUT_SECONDS]: "number",
    [AppSettingKey.VAULT_ALLOW_PASSWORD_CHANGE]: "boolean",
    [AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD]: "boolean",
    [AppSettingKey.VAULT_BLOCK_DURATION_SECONDS]: "number",
    [AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS]: "number",
    [AppSettingKey.VAULT_DEFAULT_AUTH_TYPE]: "string",
    [AppSettingKey.VAULT_AUTH_ALLOW_PASSWORD]: "boolean",
    [AppSettingKey.VAULT_AUTH_ALLOW_PIN]: "boolean",
    [AppSettingKey.VAULT_PASSWORD_MIN_LENGTH]: "number",
    [AppSettingKey.VAULT_PASSWORD_MAX_LENGTH]: "number",
    [AppSettingKey.VAULT_PIN_MIN_LENGTH]: "number",
    [AppSettingKey.VAULT_PIN_MAX_LENGTH]: "number",
    [AppSettingKey.ALLOW_VAULT_DELETION]: "boolean",
    [AppSettingKey.DISABLE_VAULT_SHARING]: "boolean",
    [AppSettingKey.ADMIN_CAN_DELETE_ANY_VAULT]: "boolean",
    [AppSettingKey.ADMIN_CAN_DELETE_ANY_COLLECTION]: "boolean",
    [AppSettingKey.ALLOW_PUBLIC_COLLECTIONS]: "boolean",
    [AppSettingKey.ADMIN_CAN_CHANGE_RESOURCE_OWNER]: "boolean",
    [AppSettingKey.MAX_VAULTS_PER_USER]: "number",
    [AppSettingKey.MAX_COLLECTIONS_PER_USER]: "number",
};

const updateSettingSchema = z.object({
    key: z.enum(AppSettingKey),
    value: z.union([z.boolean(), z.number().int(), z.string()]),
});

/**
 * Generic action to update a single app setting by key.
 * Validates that the runtime type of value matches the expected type for the given key.
 *
 * @param input.key - The {@link AppSettingKey} to update.
 * @param input.value - The new value; must match the type expected for the key.
 * @returns Success flag and a confirmation message.
 */
export const updateSetting = actionClientWithAdmin
    .inputSchema(updateSettingSchema)
    .action(withLogging(async ({ parsedInput: { key, value }, ctx }, { log }) => {
        log.info("Updating app setting", { userId: ctx.user.id, key });

        const expectedType = SETTING_TYPES[key];
        if (typeof value !== expectedType) {
            throw new Error(
                `Invalid value type for "${key}": expected ${expectedType}, received ${typeof value}.`,
            );
        }

        await upsertSetting(key, value as AppSettingValueType[typeof key]);

        return { success: true, message: `Setting "${key}" updated successfully.` };
    }, {
        namespace: "server.actions.admin:updateSetting",
    }));

const configurationSchema = z.object({
    [AppSettingKey.ALLOW_USER_SIGNUP]: z.boolean(),
    [AppSettingKey.ALLOW_USER_ACCOUNT_DELETION]: z.boolean(),
    [AppSettingKey.ALLOW_INVITE_CODE_GENERATION]: z.boolean(),
    [AppSettingKey.SESSION_TIMEOUT_SECONDS]: z.number().int().positive(),
    [AppSettingKey.VAULT_ALLOW_PASSWORD_CHANGE]: z.boolean(),
    [AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD]: z.boolean(),
    [AppSettingKey.VAULT_BLOCK_DURATION_SECONDS]: z.number().int().min(0),
    [AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS]: z.number().int().positive(),
    [AppSettingKey.VAULT_DEFAULT_AUTH_TYPE]: z.enum(KeyVaultAuthType),
    [AppSettingKey.VAULT_AUTH_ALLOW_PASSWORD]: z.boolean(),
    [AppSettingKey.VAULT_AUTH_ALLOW_PIN]: z.boolean(),
    [AppSettingKey.VAULT_PASSWORD_MIN_LENGTH]: z.number().int().positive(),
    [AppSettingKey.VAULT_PASSWORD_MAX_LENGTH]: z.number().int().positive(),
    [AppSettingKey.VAULT_PIN_MIN_LENGTH]: z.number().int().positive(),
    [AppSettingKey.VAULT_PIN_MAX_LENGTH]: z.number().int().positive(),
    [AppSettingKey.ALLOW_VAULT_DELETION]: z.boolean(),
    [AppSettingKey.DISABLE_VAULT_SHARING]: z.boolean(),
    [AppSettingKey.ADMIN_CAN_DELETE_ANY_VAULT]: z.boolean(),
    [AppSettingKey.ADMIN_CAN_DELETE_ANY_COLLECTION]: z.boolean(),
    [AppSettingKey.ADMIN_CAN_CHANGE_RESOURCE_OWNER]: z.boolean(),
    [AppSettingKey.ALLOW_PUBLIC_COLLECTIONS]: z.boolean(),
    [AppSettingKey.MAX_VAULTS_PER_USER]: z.number().int().positive(),
    [AppSettingKey.MAX_COLLECTIONS_PER_USER]: z.number().int().positive(),
});

/**
 * Persists the full application configuration to the database.
 *
 * @param input - An object containing all `AppSettingKey` entries with their new values.
 * @returns Success flag and a confirmation message.
 */
export const saveConfiguration = actionClientWithAdmin
    .inputSchema(configurationSchema)
    .action(withLogging(async ({ parsedInput, ctx }, { log }) => {
        log.info("Saving admin configuration", { userId: ctx.user.id });

        await upsertSettings(parsedInput as Partial<AppSettingValueType>);

        return { success: true, message: "Configuration saved successfully." };
    }, {
        namespace: "server.actions.admin:saveConfiguration",
    }));

/**
 * Invalidates the in-memory settings cache and reloads settings from the database.
 *
 * @returns Success flag and a confirmation message.
 */
export const reloadSettings = actionClientWithAdmin
    .action(withLogging(async ({ ctx }, { log }) => {
        log.info("Reloading app settings", { userId: ctx.user.id });

        invalidateSettingsCache();
        await loadSettings();

        return { success: true, message: "Settings reloaded from database." };
    }, {
        namespace: "server.actions.admin:reloadSettings",
    }));

/**
 * Transfers ownership of a vault to another user.
 *
 * @param input.vaultId - ID of the vault whose owner should change.
 * @param input.ownerId - ID of the new owner user.
 * @returns Success flag and a confirmation message.
 */
export const changeVaultOwner = actionClientWithAdmin
    .inputSchema(z.object({
        vaultId: z.string().min(1),
        ownerId: z.string().min(1),
    }))
    .action(withLogging(async ({ parsedInput: { vaultId, ownerId }, ctx }, { log }) => {
        log.info("Changing vault owner", { userId: ctx.user.id, vaultId, ownerId });

        await prisma.keyVault.update({
            where: { id: vaultId },
            data: { createdById: ownerId },
        });

        return { success: true, message: "Vault owner updated successfully." };
    }, {
        namespace: "server.actions.admin:changeVaultOwner",
    }));

/**
 * Transfers ownership of a collection to another user.
 *
 * @param input.collectionId - ID of the collection whose owner should change.
 * @param input.ownerId - ID of the new owner user.
 * @returns Success flag and a confirmation message.
 */
export const changeCollectionOwner = actionClientWithAdmin
    .inputSchema(z.object({
        collectionId: z.string().min(1),
        ownerId: z.string().min(1),
    }))
    .action(withLogging(async ({ parsedInput: { collectionId, ownerId }, ctx }, { log }) => {
        log.info("Changing collection owner", { userId: ctx.user.id, collectionId, ownerId });

        await prisma.collection.update({
            where: { id: collectionId },
            data: { createdById: ownerId },
        });

        return { success: true, message: "Collection owner updated successfully." };
    }, {
        namespace: "server.actions.admin:changeCollectionOwner",
    }));

/**
 * Allows an admin to manually queue one of the supported background jobs.
 * User-specific jobs (IMPORT_USER_LIBRARY) require a valid userId.
 */
export const invokeAdminJob = actionClientWithAdmin
    .inputSchema(z.object({
        type: z.enum([
            JobType.SYNC_STEAM_GAMES,
            JobType.IMPORT_USER_LIBRARY,
            JobType.REFRESH_GAME_DETAILS,
        ] as const),
        userId: z.string().min(1).optional(),
    }))
    .action(withLogging(async ({ parsedInput: { type, userId }, ctx }, { log }) => {
        log.info("Invoking admin job", { invokedBy: ctx.user.id, type, targetUserId: userId });

        if (type === JobType.IMPORT_USER_LIBRARY && !userId) {
            throw new Error("IMPORT_USER_LIBRARY requires a target user to be selected.");
        }

        const job = await prisma.job.create({
            data: { type, userId: userId ?? null },
        });

        await jobsQueue.add(type, { jobId: job.id, userId, type });

        log.info("Admin job queued successfully", { jobId: job.id, type, invokedBy: ctx.user.id });

        return { success: true, jobId: job.id, message: `Job "${type}" queued successfully.` };
    }, { namespace: "server.actions.admin:invokeAdminJob" }));