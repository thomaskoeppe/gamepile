import { registerOTel } from '@vercel/otel';

export async function register() {
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