"use server";

import {z} from "zod";

import {getSetting} from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {AppSettingKey} from "@/prisma/generated/enums";
import {actionClientWithAdmin} from "@/server/actions";

/**
 * Creates a new invite code with optional expiry and usage limits.
 * Requires admin privileges and the invite-code generation feature to be enabled.
 *
 * @param input.expiresAt - Optional expiry date for the invite code.
 * @param input.maxUses - Optional maximum number of times the code can be used.
 * @returns The created invite code's `id` and `code`.
 * @throws {Error} If invite code generation is disabled by the administrator.
 */
export const createInviteCode = actionClientWithAdmin.inputSchema(z.object({
    expiresAt: z.date().optional(),
    maxUses: z.number().int().positive().optional(),
})).action(withLogging(async ({parsedInput: { expiresAt, maxUses }, ctx}, {log}) => {
    if (!getSetting(AppSettingKey.ALLOW_INVITE_CODE_GENERATION)) throw new Error("Invite Code Generation is disabled!");

    log.info("Creating invite code", {
        expiresAt,
        maxUses,
        userId: ctx.user.id
    });

    const inviteCode = await prisma.inviteCode.create({
        data: {
            createdById: ctx.user.id,
            expiresAt,
            maxUses
        }
    });

    return { success: true, message: "Invite-Code created.", data: { id: inviteCode.id, code: inviteCode.code } };
}, {
    namespace: "server.actions.invite-codes:createInviteCode",
}));

/**
 * Deletes an existing invite code.
 * Requires admin privileges.
 *
 * @param input.inviteCodeId - CUID of the invite code to delete.
 * @returns Success flag and the deleted code string.
 * @throws {Error} If the invite code is not found.
 */
export const deleteInviteCode = actionClientWithAdmin.inputSchema(z.object({
    inviteCodeId: z.cuid(),
})).action(withLogging(async ({parsedInput: { inviteCodeId }, ctx}, {log}) => {
    const inviteCode = await prisma.inviteCode.findUnique({
        where: { id: inviteCodeId },
        select: { code: true },
    });

    if (!inviteCode) {
        throw new Error("Invite code not found.");
    }

    log.info("Deleting invite code", {
        inviteCodeId,
        code: inviteCode.code,
        userId: ctx.user.id
    });

    await prisma.inviteCode.delete({
        where: {
            id: inviteCodeId,
        }
    });

    return { success: true, message: `Invite code ${inviteCode.code} deleted.` };
}, {
    namespace: "server.actions.invite-codes:deleteInviteCode",
}));