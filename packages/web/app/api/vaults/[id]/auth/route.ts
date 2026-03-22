import { NextRequest, NextResponse } from "next/server";

import { verifyPassword } from "@/lib/auth/crypto";
import { getCurrentSession } from "@/lib/auth/session";
import { generateVaultAccessToken, setVaultAccessCookie } from "@/lib/auth/vault/token";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const log = logger.child("api.routes.vaults:auth");
    const start = Date.now();

    const sessionData = await getCurrentSession();
    if (!sessionData) {
        log.warn("Vault auth rejected — no session", { durationMs: Date.now() - start });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: vaultId } = await params;
    const userId = sessionData.user.id;
    log.info("Vault authentication attempt", { userId, vaultId });

    const vault = await prisma.keyVault.findFirst({
        where: {
            id: vaultId,
            OR: [
                { createdById: userId },
                { users: { some: { userId } } },
            ],
        },
        select: {
            id: true,
            authType: true,
            authHash: true,
            authSalt: true,
        },
    });

    if (!vault) {
        log.warn("Vault not found or access denied", { userId, vaultId, durationMs: Date.now() - start });
        return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }

    if (vault.authType === "NONE") {
        log.info("Vault does not require authentication", { vaultId, durationMs: Date.now() - start });
        return NextResponse.json({ error: "Vault does not require authentication" }, { status: 400 });
    }

    let body: { password?: string };
    try {
        body = await request.json();
    } catch {
        log.warn("Invalid request body for vault auth", { userId, vaultId });
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!body.password) {
        log.warn("Missing password in vault auth request", { userId, vaultId });
        return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    if (!vault.authHash || !vault.authSalt) {
        log.error("Vault auth misconfigured — missing hash or salt", undefined, { vaultId });
        return NextResponse.json({ error: "Vault authentication is not configured" }, { status: 500 });
    }

    const isValid = verifyPassword(body.password, vault.authSalt, vault.authHash);

    if (!isValid) {
        log.warn("Vault authentication failed — incorrect password", { userId, vaultId, authType: vault.authType, durationMs: Date.now() - start });
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = generateVaultAccessToken(vault.id, userId);
    await setVaultAccessCookie(vault.id, token);

    log.info("Vault authentication succeeded", { userId, vaultId, authType: vault.authType, durationMs: Date.now() - start });
    return NextResponse.json({ success: true });
}
