"use server";

import { z } from "zod";

import { getAllSettings } from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import type { Prisma } from "@/prisma/generated/client";
import { JobStatus, JobType } from "@/prisma/generated/enums";
import { queryClientWithAdmin } from "@/server/query";
import type { AppSettingValueType } from "@/types/app-setting";

export const getAdminCollections = queryClientWithAdmin.query<Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
    owner: { id: string; username: string; steamId: string };
    gameCount: number;
    memberCount: number;
}>>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching admin collections", { userId: ctx.user.id });

    const collections = await prisma.collection.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            type: true,
            createdAt: true,
            createdBy: { select: { id: true, username: true, steamId: true } },
            _count: { select: { games: true, users: true } },
        },
    });

    return collections.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        createdAt: c.createdAt.toISOString(),
        owner: c.createdBy,
        gameCount: c._count.games,
        memberCount: c._count.users,
    }));
}, {
    namespace: "server.queries.admin:getAdminCollections",
}));

export const getAdminVaults = queryClientWithAdmin.query<Array<{
    id: string;
    name: string;
    authType: string;
    createdAt: string;
    owner: { id: string; username: string; steamId: string };
    memberCount: number;
    gameCount: number;
}>>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching admin vaults", { userId: ctx.user.id });

    const vaults = await prisma.keyVault.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            authType: true,
            createdAt: true,
            createdBy: { select: { id: true, username: true, steamId: true } },
            _count: { select: { games: true, users: true } },
        },
    });

    return vaults.map((v) => ({
        id: v.id,
        name: v.name,
        authType: v.authType,
        createdAt: v.createdAt.toISOString(),
        owner: v.createdBy,
        memberCount: v._count.users,
        gameCount: v._count.games,
    }));
}, {
    namespace: "server.queries.admin:getAdminVaults",
}));

export const getAllUsers = queryClientWithAdmin.query<Array<{
    id: string;
    username: string;
    steamId: string;
}>>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching all users", { userId: ctx.user.id });

    return prisma.user.findMany({
        orderBy: { username: "asc" },
        select: { id: true, username: true, steamId: true },
    });
}, {
    namespace: "server.queries.admin:getAllUsers",
}));

export type AdminUserListItem = {
    id: string;
    username: string;
    steamId: string;
    avatarUrl: string | null;
    profileUrl: string;
    role: string;
    createdAt: string;
    lastLogin: string;
    activeSessionCount: number;
    counts: {
        collectionsOwned: number;
        collectionMemberships: number;
        vaultsOwned: number;
        vaultMemberships: number;
        jobs: number;
        inviteCodesCreated: number;
        inviteCodesUsed: number;
    };
    inviteCodeUsage: {
        code: string;
        usedAt: string;
    } | null;
    privacy: {
        allowVaultInvites: boolean;
        allowCollectionInvites: boolean;
        allowProfileView: boolean;
    };
};

export type AdminUsersData = {
    summary: {
        totalUsers: number;
        adminUsers: number;
        usersAllowingVaultInvites: number;
        usersAllowingCollectionInvites: number;
    };
    users: AdminUserListItem[];
};

type AdminUserQueryRecord = Prisma.UserGetPayload<{
    select: {
        id: true;
        username: true;
        steamId: true;
        avatarUrl: true;
        profileUrl: true;
        role: true;
        createdAt: true;
        lastLogin: true;
        sessions: {
            select: {
                id: true;
            };
        };
        settings: {
            select: {
                privacyAllowVaultInvites: true;
                privacyAllowCollectionInvites: true;
                privacyAllowProfileView: true;
            };
        };
        inviteCodeUsages: {
            select: {
                usedAt: true;
                inviteCode: {
                    select: {
                        code: true;
                    };
                };
            };
        };
        _count: {
            select: {
                collectionsOwned: true;
                collectionUsers: true;
                keyVaultsCreated: true;
                keyVaultUsers: true;
                jobs: true;
                inviteCodes: true;
                inviteCodeUsages: true;
            };
        };
    };
}>;

type AdminUserInviteCodeUsageRecord = Prisma.InviteCodeUsageGetPayload<{
    select: {
        usedAt: true;
        inviteCode: {
            select: {
                code: true;
            };
        };
    };
}>;

export const getAdminUsers = queryClientWithAdmin.query<AdminUsersData>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching admin users", { userId: ctx.user.id });

    const now = new Date();
    const users: AdminUserQueryRecord[] = await prisma.user.findMany({
        orderBy: [{ lastLogin: "desc" }, { username: "asc" }],
        select: {
            id: true,
            username: true,
            steamId: true,
            avatarUrl: true,
            profileUrl: true,
            role: true,
            createdAt: true,
            lastLogin: true,
            sessions: {
                where: {
                    expiresAt: { gt: now },
                },
                select: {
                    id: true,
                },
            },
            settings: {
                select: {
                    privacyAllowVaultInvites: true,
                    privacyAllowCollectionInvites: true,
                    privacyAllowProfileView: true,
                },
            },
            inviteCodeUsages: {
                orderBy: {
                    usedAt: "desc",
                },
                take: 1,
                select: {
                    usedAt: true,
                    inviteCode: {
                        select: {
                            code: true,
                        },
                    },
                },
            },
            _count: {
                select: {
                    collectionsOwned: true,
                    collectionUsers: true,
                    keyVaultsCreated: true,
                    keyVaultUsers: true,
                    jobs: true,
                    inviteCodes: true,
                    inviteCodeUsages: true,
                },
            },
        },
    });

    const mappedUsers = users.map((user) => {
        const privacy = {
            allowVaultInvites: user.settings?.privacyAllowVaultInvites ?? true,
            allowCollectionInvites: user.settings?.privacyAllowCollectionInvites ?? true,
            allowProfileView: user.settings?.privacyAllowProfileView ?? true,
        };
        const latestInviteCodeUsage = (user.inviteCodeUsages[0] ?? null) as AdminUserInviteCodeUsageRecord | null;

        return {
            id: user.id,
            username: user.username,
            steamId: user.steamId,
            avatarUrl: user.avatarUrl,
            profileUrl: user.profileUrl,
            role: user.role,
            createdAt: user.createdAt.toISOString(),
            lastLogin: user.lastLogin.toISOString(),
            activeSessionCount: user.sessions.length,
            counts: {
                collectionsOwned: user._count.collectionsOwned,
                collectionMemberships: user._count.collectionUsers,
                vaultsOwned: user._count.keyVaultsCreated,
                vaultMemberships: user._count.keyVaultUsers,
                jobs: user._count.jobs,
                inviteCodesCreated: user._count.inviteCodes,
                inviteCodesUsed: user._count.inviteCodeUsages,
            },
            inviteCodeUsage: latestInviteCodeUsage
                ? {
                    code: latestInviteCodeUsage.inviteCode.code,
                    usedAt: latestInviteCodeUsage.usedAt.toISOString(),
                }
                : null,
            privacy,
        } satisfies AdminUserListItem;
    });

    return {
        summary: {
            totalUsers: mappedUsers.length,
            adminUsers: mappedUsers.filter((user) => user.role === "ADMIN").length,
            usersAllowingVaultInvites: mappedUsers.filter((user) => user.privacy.allowVaultInvites).length,
            usersAllowingCollectionInvites: mappedUsers.filter((user) => user.privacy.allowCollectionInvites).length,
        },
        users: mappedUsers,
    };
}, {
    namespace: "server.queries.admin:getAdminUsers",
}));

export const getAdminConfiguration = queryClientWithAdmin.query<AppSettingValueType>(
    withLogging(async ({ ctx }, { log }) => {
        log.info("Fetching admin configuration", { userId: ctx.user.id });
        return getAllSettings();
    }, {
        namespace: "server.queries.admin:getAdminConfiguration",
    })
);

export const getAdminJobs = queryClientWithAdmin.inputSchema(z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(20),
    status: z.string().optional(),
    type: z.string().optional(),
})).query<{
    jobs: Array<{
        id: string;
        type: JobType;
        status: JobStatus;
        progress: number;
        processedItems: number;
        totalItems: number;
        failedItems: number;
        allItemsQueued: boolean;
        startedAt: string | null;
        finishedAt: string | null;
        errorMessage: string | null;
        createdAt: string;
        user: { id: string; username: string; avatarUrl: string | null } | null;
        _count: { logs: number; failedChildJobs: number };
    }>;
    pagination: { page: number; limit: number; total: number; pages: number };
}>(withLogging(async ({ parsedInput: { page, limit, status, type }, ctx }, { log }) => {
    log.info("Fetching admin jobs", { userId: ctx.user.id, page, limit, status, type });

    const where = {
        ...(status && Object.values(JobStatus).includes(status as JobStatus) ? { status: status as JobStatus } : {}),
        ...(type && Object.values(JobType).includes(type as JobType) ? { type: type as JobType } : {}),
    };

    const [jobs, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                type: true,
                status: true,
                progress: true,
                processedItems: true,
                totalItems: true,
                failedItems: true,
                allItemsQueued: true,
                startedAt: true,
                finishedAt: true,
                errorMessage: true,
                createdAt: true,
                user: { select: { id: true, username: true, avatarUrl: true } },
                _count: { select: { logs: true, failedChildJobs: true } },
            },
        }),
        prisma.job.count({ where }),
    ]);

    return {
        jobs: jobs.map((j) => ({
            ...j,
            startedAt: j.startedAt?.toISOString() ?? null,
            finishedAt: j.finishedAt?.toISOString() ?? null,
            createdAt: j.createdAt.toISOString(),
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}, {
    namespace: "server.queries.admin:getAdminJobs",
}));

