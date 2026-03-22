"use server";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { queryClientWithAuth } from "@/server/query";

type UserSettingsData = {
    privacyAllowVaultInvites: boolean;
    privacyAllowCollectionInvites: boolean;
    privacyAllowProfileView: boolean;
};

export const getUserSettings = queryClientWithAuth.query<UserSettingsData>(
    withLogging(async ({ ctx }, { log }) => {
        log.info("Fetching user settings", { userId: ctx.user.id });

        const settings = await prisma.userSettings.findUnique({
            where: { userId: ctx.user.id },
            select: {
                privacyAllowVaultInvites: true,
                privacyAllowCollectionInvites: true,
                privacyAllowProfileView: true,
            },
        });

        return settings ?? {
            privacyAllowVaultInvites: true,
            privacyAllowCollectionInvites: true,
            privacyAllowProfileView: true,
        };
    }, {
        namespace: "server.queries.user-settings:getUserSettings",
    })
);

