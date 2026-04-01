"use server";

import { z } from "zod";

import { getSetting } from "@/lib/app-settings";
import { clearSessionCookie } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { AppSettingKey } from "@/prisma/generated/enums";
import { actionClientWithAuth } from "@/server/actions";

/**
 * Updates the authenticated user's privacy settings (vault invites,
 * collection invites, profile visibility).
 *
 * @param input.privacyAllowVaultInvites - Whether the user allows vault invites.
 * @param input.privacyAllowCollectionInvites - Whether the user allows collection invites.
 * @param input.privacyAllowProfileView - Whether the user allows profile viewing.
 * @returns Success flag and confirmation message.
 */
export const updatePrivacySettings = actionClientWithAuth.inputSchema(z.object({
    privacyAllowVaultInvites: z.boolean(),
    privacyAllowCollectionInvites: z.boolean(),
    privacyAllowProfileView: z.boolean(),
})).action(withLogging(async ({ parsedInput, ctx }, { log }) => {
    log.info("Updating privacy settings", {
        userId: ctx.user.id,
        ...parsedInput,
    });

    await prisma.userSettings.upsert({
        where: { userId: ctx.user.id },
        update: {
            privacyAllowVaultInvites: parsedInput.privacyAllowVaultInvites,
            privacyAllowCollectionInvites: parsedInput.privacyAllowCollectionInvites,
            privacyAllowProfileView: parsedInput.privacyAllowProfileView,
        },
        create: {
            userId: ctx.user.id,
            privacyAllowVaultInvites: parsedInput.privacyAllowVaultInvites,
            privacyAllowCollectionInvites: parsedInput.privacyAllowCollectionInvites,
            privacyAllowProfileView: parsedInput.privacyAllowProfileView,
        },
    });

    return { success: true, message: "Privacy settings saved successfully." };
}, {
    namespace: "server.actions.user-settings:updatePrivacySettings",
}));

/**
 * Permanently deletes the authenticated user's account.
 * Requires the user to type "DELETE" as confirmation and the
 * account-deletion feature to be enabled by the administrator.
 *
 * @param input.confirmation - Must be the string `"DELETE"`.
 * @returns Success flag and confirmation message.
 * @throws {Error} If account deletion is disabled by the administrator.
 */
export const deleteAccount = actionClientWithAuth.inputSchema(z.object({
    confirmation: z.string()
        .trim()
        .toUpperCase()
        .refine((value) => value === "DELETE", {
            message: 'Type "DELETE" to confirm account deletion.',
        }),
})).action(withLogging(async ({ ctx }, { log }) => {
    log.info("Deleting user account", { userId: ctx.user.id });

    const allowDeletion = getSetting(AppSettingKey.ALLOW_USER_ACCOUNT_DELETION);
    if (!allowDeletion) {
        throw new Error("Account deletion is currently disabled by the administrator.");
    }

    await prisma.user.delete({
        where: { id: ctx.user.id },
    });

    await clearSessionCookie();

    return { success: true, message: "Account deleted successfully." };
}, {
    namespace: "server.actions.user-settings:deleteAccount",
}));
