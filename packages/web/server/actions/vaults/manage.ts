"use server";

import { z } from "zod";

import { getSetting } from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import { getSlugError, normalizeSlug } from "@/lib/slug";
import { withLogging } from "@/lib/with-logging";
import { Prisma } from "@/prisma/generated/client";
import { AppSettingKey } from "@/prisma/generated/enums";
import { actionClientWithAuth } from "@/server/actions";

export const renameVault = actionClientWithAuth
    .inputSchema(
        z.object({
            vaultId: z.string().min(1),
            name: z.string().min(5).max(25),
        }),
    )
    .action(
        withLogging(
            async ({ parsedInput: { vaultId, name }, ctx }, { log }) => {
                log.info("Renaming vault", { userId: ctx.user.id, vaultId, name });

                const vault = await prisma.keyVault.findFirst({
                    where: { id: vaultId, createdById: ctx.user.id },
                    select: { id: true },
                });

                if (!vault) throw new Error("Vault not found or you do not have permission to rename it.");

                try {
                    await prisma.keyVault.update({
                        where: { id: vaultId },
                        data: { name },
                    });
                } catch (error) {
                    if (
                        error instanceof Prisma.PrismaClientKnownRequestError
                        && error.code === "P2002"
                    ) {
                        throw new Error("You already have a vault with that name.");
                    }

                    throw error;
                }

                return { success: true };
            },
            {
                namespace: "server.actions.vaults:renameVault",
            },
        ),
    );

/**
 * Sets or clears the custom URL slug for a vault owned by the authenticated user (#10).
 *
 * Passing an empty string clears the slug. Slugs are validated against the shared
 * rules in `lib/slug.ts` and must be globally unique.
 *
 * @param input.vaultId - ID of the vault to update.
 * @param input.slug - The desired slug, or an empty string to clear it.
 * @returns `{ success: true, slug }` with the stored slug (or `null` when cleared).
 */
export const setVaultSlug = actionClientWithAuth
    .inputSchema(
        z.object({
            vaultId: z.string().min(1),
            slug: z.string().max(64),
        }),
    )
    .action(
        withLogging(
            async ({ parsedInput: { vaultId, slug }, ctx }, { log }) => {
                const normalized = normalizeSlug(slug);
                log.info("Setting vault slug", { userId: ctx.user.id, vaultId, slug: normalized });

                if (normalized.length > 0) {
                    const error = getSlugError(normalized);
                    if (error) throw new Error(error);
                }

                const vault = await prisma.keyVault.findFirst({
                    where: { id: vaultId, createdById: ctx.user.id },
                    select: { id: true },
                });

                if (!vault) throw new Error("Vault not found or you do not have permission to edit it.");

                try {
                    await prisma.keyVault.update({
                        where: { id: vaultId },
                        data: { slug: normalized.length > 0 ? normalized : null },
                    });
                } catch (error) {
                    if (
                        error instanceof Prisma.PrismaClientKnownRequestError
                        && error.code === "P2002"
                    ) {
                        throw new Error("That URL is already taken.");
                    }

                    throw error;
                }

                return { success: true, slug: normalized.length > 0 ? normalized : null };
            },
            {
                namespace: "server.actions.vaults:setVaultSlug",
            },
        ),
    );

export const deleteVault = actionClientWithAuth
    .inputSchema(
        z.object({
            vaultId: z.string().min(1),
        }),
    )
    .action(
        withLogging(
            async ({ parsedInput: { vaultId }, ctx }, { log }) => {
                log.info("Deleting vault", { userId: ctx.user.id, vaultId });

                const allowDeletion = getSetting(AppSettingKey.ALLOW_VAULT_DELETION);
                if (!allowDeletion) throw new Error("Vault deletion is disabled by the administrator.");

                const vault = await prisma.keyVault.findFirst({
                    where: { id: vaultId, createdById: ctx.user.id },
                    select: { id: true },
                });

                if (!vault) throw new Error("Vault not found or you do not have permission to delete it.");

                await prisma.keyVault.delete({ where: { id: vaultId } });

                return { success: true };
            },
            {
                namespace: "server.actions.vaults:deleteVault",
            },
        ),
    );

