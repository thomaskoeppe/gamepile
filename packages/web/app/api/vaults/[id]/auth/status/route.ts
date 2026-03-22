import { NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth/session";
import { getVaultAccessCookie, verifyVaultAccessToken } from "@/lib/auth/vault/token";
import prisma from "@/lib/prisma";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const sessionData = await getCurrentSession();
    if (!sessionData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: vaultId } = await params;

    const vault = await prisma.keyVault.findFirst({
        where: {
            id: vaultId,
            OR: [
                { createdById: sessionData.user.id },
                { users: { some: { userId: sessionData.user.id } } },
            ],
        },
        select: { authType: true },
    });

    if (!vault) {
        return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }

    if (vault.authType === "NONE") {
        return NextResponse.json({ authenticated: true, authType: vault.authType });
    }

    const token = await getVaultAccessCookie(vaultId);
    if (!token) {
        return NextResponse.json({ authenticated: false, authType: vault.authType });
    }

    const payload = verifyVaultAccessToken(token);
    const authenticated = payload !== null && payload.vaultId === vaultId && payload.userId === sessionData.user.id;

    return NextResponse.json({ authenticated, authType: vault.authType });
}
