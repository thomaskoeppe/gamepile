import { NextResponse } from "next/server";

import packageJson from "@/package.json";

/**
 * Liveness probe that also reports the running application version, so
 * operators can verify which release is live after an upgrade.
 */
export async function GET() {
    return NextResponse.json({ message: "Heartbeat OK", version: packageJson.version });
}

export async function POST() {
    return NextResponse.json({ message: "Heartbeat OK", version: packageJson.version });
}
