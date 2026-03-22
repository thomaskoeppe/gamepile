"use server";

import {getSetting} from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {AppSettingKey} from "@/prisma/generated/client";
import {queryClientWithAdmin} from "@/server/query";

export type AdminInviteCodesData = {
    generationEnabled: boolean;
    summary: {
        totalCodes: number;
        activeCodes: number;
        totalUsages: number;
    };
    codes: Array<{
        id: string;
        code: string;
        createdAt: string;
        expiresAt: string | null;
        maxUses: number | null;
        usageCount: number;
        remainingUses: number | null;
        isExpired: boolean;
        isAvailable: boolean;
        createdBy: {
            id: string;
            username: string;
            steamId: string;
        };
        usage: Array<{
            id: string;
            usedAt: string;
            usedBy: {
                id: string;
                username: string;
                steamId: string;
                avatarUrl: string | null;
            };
        }>;
    }>;
};

export const getInviteCodes = queryClientWithAdmin.query<AdminInviteCodesData>(withLogging(async ({ ctx }, { log }) => {
    const generationEnabled = getSetting(AppSettingKey.ALLOW_INVITE_CODE_GENERATION);

    log.info("Fetching invite codes", {
        userId: ctx.user.id
    });

    const inviteCodes = await prisma.inviteCode.findMany({
        orderBy: {
            createdAt: "desc",
        },
        include: {
            usage: {
                orderBy: {
                    usedAt: "desc",
                },
                include: {
                    usedBy: {
                        select: {
                            id: true,
                            username: true,
                            steamId: true,
                            avatarUrl: true,
                        },
                    }
                }
            },
            createdBy: {
                select: {
                    id: true,
                    username: true,
                    steamId: true,
                },
            }
        }
    });

    type InviteCodeUsageRecord = (typeof inviteCodes)[number];
    type InviteCodeRedemptionRecord = InviteCodeUsageRecord["usage"][number];

    const now = Date.now();
    const codes = inviteCodes.map((inviteCode: InviteCodeUsageRecord) => {
        const usageCount = inviteCode.usage.length;
        const remainingUses = inviteCode.maxUses == null
            ? null
            : Math.max(inviteCode.maxUses - usageCount, 0);
        const isExpired = inviteCode.expiresAt != null && inviteCode.expiresAt.getTime() <= now;
        const isAvailable = !isExpired && (remainingUses == null || remainingUses > 0);

        return {
            id: inviteCode.id,
            code: inviteCode.code,
            createdAt: inviteCode.createdAt.toISOString(),
            expiresAt: inviteCode.expiresAt?.toISOString() ?? null,
            maxUses: inviteCode.maxUses,
            usageCount,
            remainingUses,
            isExpired,
            isAvailable,
            createdBy: inviteCode.createdBy,
            usage: inviteCode.usage.map((usage: InviteCodeRedemptionRecord) => ({
                id: usage.id,
                usedAt: usage.usedAt.toISOString(),
                usedBy: usage.usedBy,
            })),
        };
    });

    return {
        generationEnabled,
        summary: {
            totalCodes: codes.length,
            activeCodes: codes.filter((code) => code.isAvailable).length,
            totalUsages: codes.reduce((total, code) => total + code.usageCount, 0),
        },
        codes,
    };
}, {
    namespace: "server.queries.invite-codes:getInviteCodes"
}));