import { registerOTel } from '@vercel/otel';
import {z} from "zod";

import {validateEnv} from "@/env";

export async function register() {
    const envValidateResult = validateEnv();

    if (!envValidateResult.success) {
        process.stderr.write("Environment variable validation failed\n");
        process.stderr.write(`${z.prettifyError(envValidateResult.error)}\n`);
        process.exit(1);
    }

    registerOTel({
        serviceName: "gamepile-web",
    });

    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { initializeLogsExporter } = await import("@/lib/logs-exporter");
        initializeLogsExporter();

        const { loadSettings } = await import("@/lib/app-settings");
        await loadSettings();
    }
}