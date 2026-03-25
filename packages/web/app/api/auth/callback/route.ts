import { NextResponse } from "next/server";

import { createJob } from "@/lib/actions/jobs";
import { getSetting } from "@/lib/app-settings";
import { createUserSession, setSessionCookie } from "@/lib/auth/session";
import { getSteamProfile,verifySteamLogin } from "@/lib/auth/steam";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { AppSettingKey, JobType } from "@/prisma/generated/enums";

export async function GET(request: Request) {
    const log = logger.child("api.routes.auth:callback");
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const start = Date.now();

    const appUrl = process.env.WEB_APP_URL || url.origin;
    const redirect = (path: string) =>
        NextResponse.redirect(new URL(path, appUrl));

    try {
        const redirectPath = searchParams.get("redirect") || "/library";
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

        const userExisting = await prisma.user.findUnique({
            where: { steamId },
        });

        const allowInviteCodeGeneration = getSetting(AppSettingKey.ALLOW_INVITE_CODE_GENERATION);
        const allowUserSignup = getSetting(AppSettingKey.ALLOW_USER_SIGNUP);

        let validatedInvite: { id: string } | null = null;

        if (!userExisting && !allowUserSignup) {
            log.info("New user signup blocked — checking invite code", {
                steamId,
                allowUserSignup,
                allowInviteCodeGeneration,
            });

            if (!allowInviteCodeGeneration) {
                log.warn("Invite codes disabled — rejecting signup", { steamId, durationMs: Date.now() - start });
                return redirect("/?error=invite_codes_disabled");
            }

            const inviteCode = searchParams.get("invite_code");
            if (!inviteCode) {
                log.warn("No invite code provided — rejecting signup", { steamId, durationMs: Date.now() - start });
                return redirect("/?error=no_invite_code");
            }

            const invite = await prisma.inviteCode.findFirst({
                where: {
                    code: inviteCode,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                include: { usage: true },
            });

            if (!invite) {
                log.warn("Invalid invite code", { steamId, inviteCode, durationMs: Date.now() - start });
                return redirect("/?error=invalid_invite_code");
            }

            const remainingUses =
                invite.maxUses != null
                    ? invite.maxUses - invite.usage.length
                    : Infinity;

            if (remainingUses <= 0) {
                log.warn("Invite code exhausted", { steamId, inviteCode, usageCount: invite.usage.length, durationMs: Date.now() - start });
                return redirect("/?error=invalid_invite_code");
            }

            log.info("Invite code validated", { steamId, inviteCode, remainingUses });
            validatedInvite = invite;
        }

        const user = await prisma.user.upsert({
            where: { steamId },
            update: {
                username: profile.username,
                avatarUrl: profile.avatarUrl,
                profileUrl: profile.profileUrl,
            },
            create: {
                steamId: profile.steamId,
                username: profile.username,
                avatarUrl: profile.avatarUrl,
                profileUrl: profile.profileUrl,
            },
        });

        const isNewUser = !userExisting;
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

            if (validatedInvite) {
                await prisma.inviteCodeUsage.create({
                    data: {
                        inviteCodeId: validatedInvite.id,
                        usedById: user.id,
                    },
                });
                log.info("Invite code usage recorded", { userId: user.id, inviteCodeId: validatedInvite.id });
            }
        }

        const session = await createUserSession(user.id, request);
        await setSessionCookie(session.token);

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