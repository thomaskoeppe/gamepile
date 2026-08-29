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

        // Opens the rotating log file now, so a misconfigured LOG_FILE_DIR surfaces
        // at boot rather than silently disabling the sink on the first log line.
        const { logSinks } = await import("@/lib/logger");
        logSinks.initialize?.();

        const { ensureSettingsLoaded } = await import("@/lib/app-settings");

        // Best-effort: a cold settings store degrades to defaults and repairs itself
        // on a later request. Failing here must never leave the process serving 500s.
        await ensureSettingsLoaded();
    }
}