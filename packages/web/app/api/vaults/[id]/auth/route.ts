import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export async function POST() {
    const log = logger.child("api.routes.vaults:auth");
    log.warn("Deprecated vault auth endpoint invoked");
    return NextResponse.json(
        { error: "Use authenticated server action 'authenticateVault' instead." },
        { status: 410 },
    );
}
