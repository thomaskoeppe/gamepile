/**
 * src/instrumentation.ts
 *
 * Bootstraps OpenTelemetry tracing via NodeSDK.
 * Must be imported FIRST in index.ts
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";

const env = getWorkerEnv();
const OTLP_BASE = env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "");

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]:    env.OTEL_SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version  ?? "0.0.0",
    }),
    traceExporter: new OTLPTraceExporter({
        url: `${OTLP_BASE}/v1/traces`,
    }),
    instrumentations: [
        getNodeAutoInstrumentations({
            "@opentelemetry/instrumentation-ioredis": { enabled: true },
            "@opentelemetry/instrumentation-fs": { enabled: false },
            "@opentelemetry/instrumentation-dns": { enabled: false },
        }),
    ],
});

sdk.start();
logger.child("worker.instrumentation:start").info("NodeSDK started", {
    otlpBase: OTLP_BASE,
});

export async function shutdownTracing(): Promise<void> {
    await sdk.shutdown();
}