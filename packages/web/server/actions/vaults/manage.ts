"use server";

import { z } from "zod";

import { getSetting } from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
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

                await prisma.keyVault.update({
                    where: { id: vaultId },
                    data: { name },
                });

                return { success: true };
            },
            {
                namespace: "server.actions.vaults:renameVault",
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

