import { NextResponse } from "next/server";

import { createJob } from "@/lib/actions/jobs";
import { getSetting } from "@/lib/app-settings";
import { sanitizePostAuthRedirect } from "@/lib/auth/redirect";
import { createUserSession, setSessionCookie } from "@/lib/auth/session";
import { getSteamProfile,verifySteamLogin } from "@/lib/auth/steam";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import {AppSettingKey, JobType, UserRole} from "@/prisma/generated/enums";

const SERIALIZATION_RETRY_LIMIT = 3;

function isSerializableConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const maybeError = error as { code?: string; message?: string };
    return maybeError.code === "P2034" || maybeError.message?.toLowerCase().includes("serialization") === true;
}

export async function GET(request: Request) {
    const log = logger.child("api.routes.auth:callback", {
        requestId: request.headers.get("x-request-id") ?? undefined,
    });
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const start = Date.now();

    const appUrl = process.env.WEB_APP_URL || url.origin;
    const redirect = (path: string) =>
        NextResponse.redirect(new URL(path, appUrl));

    try {
        const redirectPath = sanitizePostAuthRedirect(searchParams.get("redirect"));
        log.info("Auth callback started", { redirectPath });

        const steamId = await verifySteamLogin(searchParams);
        if (!steamId) {
            log.warn("Steam verification failed — redirecting to error", { durationMs: Date.now() - start });
            return redirect("/?error=verification_failed");
        }

        log.debug("Steam verification successful", { steamId });

        const profile = await getSteamProfile(steamId);
        if (!profile) {
            log.warn("Steam profile fetch failed", { steamId, durationMs: Date.now() - start });
            return redirect("/?error=profile_fetch_failed");
        }

        log.debug("Steam profile fetched", { steamId, username: profile.username });

        const allowInviteCodeGeneration = getSetting(AppSettingKey.ALLOW_INVITE_CODE_GENERATION);
        const allowUserSignup = getSetting(AppSettingKey.ALLOW_USER_SIGNUP);
        const inviteCode = searchParams.get("invite_code")?.trim() || null;

        let authResult: { user: Awaited<ReturnType<typeof prisma.user.create>>; isNewUser: boolean } | null = null;

        for (let attempt = 1; attempt <= SERIALIZATION_RETRY_LIMIT; attempt += 1) {
            try {
                const result = await prisma.$transaction(async (tx) => {
                    const existing = await tx.user.findUnique({
                        where: { steamId },
                        select: { id: true },
                    });

                    if (existing) {
                        const updatedUser = await tx.user.update({
                            where: { steamId },
                            data: {
                                username: profile.username,
                                avatarUrl: profile.avatarUrl,
                                profileUrl: profile.profileUrl,
                                lastLogin: new Date(),
                            },
                        });

                        return { user: updatedUser, isNewUser: false };
                    }

                    if (!allowUserSignup) {
                        log.info("New user signup blocked — checking invite code", {
                            steamId,
                            allowUserSignup,
                            allowInviteCodeGeneration,
                        });

                        if (!allowInviteCodeGeneration) {
                            throw new Error("invite_codes_disabled");
                        }

                        if (!inviteCode) {
                            throw new Error("no_invite_code");
                        }

                        const invite = await tx.inviteCode.findFirst({
                            where: {
                                code: inviteCode,
                                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                            },
                            include: { usage: true },
                        });

                        if (!invite) {
                            throw new Error("invalid_invite_code");
                        }

                        const remainingUses = invite.maxUses != null ? invite.maxUses - invite.usage.length : Infinity;
                        if (remainingUses <= 0) {
                            throw new Error("invalid_invite_code");
                        }

                        log.info("Invite code validated inside transaction", {
                            steamId,
                            inviteCode,
                            remainingUses,
                        });

                        const createdUser = await tx.user.create({
                            data: {
                                steamId: profile.steamId,
                                username: profile.username,
                                avatarUrl: profile.avatarUrl,
                                profileUrl: profile.profileUrl,
                            },
                        });

                        await tx.inviteCodeUsage.create({
                            data: {
                                inviteCodeId: invite.id,
                                usedById: createdUser.id,
                            },
                        });

                        const totalUsers = await tx.user.count();
                        if (totalUsers === 1) {
                            await tx.user.update({
                                where: { id: createdUser.id },
                                data: { role: UserRole.ADMIN },
                            });
                            return { user: { ...createdUser, role: UserRole.ADMIN }, isNewUser: true };
                        }

                        return { user: createdUser, isNewUser: true };
                    }

                    const createdUser = await tx.user.create({
                        data: {
                            steamId: profile.steamId,
                            username: profile.username,
                            avatarUrl: profile.avatarUrl,
                            profileUrl: profile.profileUrl,
                        },
                    });

                    const totalUsers = await tx.user.count();
                    if (totalUsers === 1) {
                        await tx.user.update({
                            where: { id: createdUser.id },
                            data: { role: UserRole.ADMIN },
                        });
                        return { user: { ...createdUser, role: UserRole.ADMIN }, isNewUser: true };
                    }

                    return { user: createdUser, isNewUser: true };
                }, {
                    isolationLevel: "Serializable",
                });

                authResult = result;
                break;
            } catch (error) {
                if (error instanceof Error) {
                    if (error.message === "invite_codes_disabled") {
                        log.warn("Invite codes disabled — rejecting signup", { steamId, durationMs: Date.now() - start });
                        return redirect("/?error=invite_codes_disabled");
                    }
                    if (error.message === "no_invite_code") {
                        log.warn("No invite code provided — rejecting signup", { steamId, durationMs: Date.now() - start });
                        return redirect("/?error=no_invite_code");
                    }
                    if (error.message === "invalid_invite_code") {
                        log.warn("Invalid or exhausted invite code", { steamId, inviteCode, durationMs: Date.now() - start });
                        return redirect("/?error=invalid_invite_code");
                    }
                }

                if (attempt < SERIALIZATION_RETRY_LIMIT && isSerializableConflict(error)) {
                    log.warn("Auth callback transaction hit a serializable conflict — retrying", { steamId, attempt });
                    continue;
                }

                throw error;
            }
        }

        if (!authResult) {
            throw new Error("Auth transaction failed to produce a user.");
        }

        const { user, isNewUser } = authResult;

        log.info(isNewUser ? "New user created" : "Existing user updated", {
            userId: user.id,
            steamId: user.steamId,
            username: user.username,
        });

        if (isNewUser) {
            await prisma.userSettings.upsert({
                where: { userId: user.id },
                update: {},
                create: {
                    userId: user.id,
                    privacyAllowVaultInvites: true,
                    privacyAllowCollectionInvites: true,
                    privacyAllowProfileView: true,
                },
            });

            await createJob(JobType.IMPORT_USER_LIBRARY, user.id);
            log.info("Library import job queued for new user", { userId: user.id });

        }

        const { token } = await createUserSession(user.id, request);
        await setSessionCookie(token);

        log.info("Auth callback completed — redirecting", {
            userId: user.id,
            isNewUser,
            redirectPath,
            durationMs: Date.now() - start,
        });

        return NextResponse.redirect(new URL(redirectPath, appUrl));
    } catch (error) {
        log.error("Auth callback failed", error instanceof Error ? error : new Error(String(error)), {
            durationMs: Date.now() - start,
        });
        return redirect("/?error=auth_failed");
    }
}