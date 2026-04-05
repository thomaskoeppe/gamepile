import {z} from "zod";

/**
 * Zod schema defining and validating all environment variables required by the worker process.
 *
 * Each field includes sensible defaults where appropriate. Values are parsed from `process.env`
 * at startup and cached for the lifetime of the process.
 */
const workerEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().refine((value) => {
        try {
            const url = new URL(value);
            return url.protocol === "postgresql:";
        } catch {
            return false;
        }
    }, {
        message: "DATABASE_URL must be a valid PostgreSQL connection string",
    }),
    REDIS_HOST: z.string().min(1).default("localhost"),
    REDIS_PORT: z.preprocess((value) => Number(value ?? 6379), z.number().int().min(1).max(65535)),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_USERNAME: z.string().optional(),
    STEAM_API_KEY: z.string().regex(/^[A-Fa-f0-9]{32}$/, "STEAM_API_KEY must be a 32-character hex string"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default("http://localhost:4318"),
    OTEL_EXPORTER_OTLP_HEADERS: z.string().optional().refine((value) => {
        if (!value) return true;

        return value
            .split(",")
            .every((headerValue) => /^[^=]+=[^=]+$/.test(headerValue.trim()));
    }, {
        message: "OTEL_EXPORTER_OTLP_HEADERS must be comma-separated key=value pairs",
    }),
    OTEL_SERVICE_NAME: z.string().min(1).default("gamepile-worker"),
    PRISMA_LOG_QUERIES: z.enum(["true", "false"]).optional().default("true"),
    WORKER_LOG_TO_STDOUT: z.enum(["true", "false"]).optional().default("true"),
    WORKER_JOBS_CONCURRENCY: z.preprocess((value) => Number(value ?? 3), z.number().int().positive()),
    WORKER_DETAILS_CONCURRENCY: z.preprocess((value) => Number(value ?? 3), z.number().int().positive()),
    WORKER_DETAILS_BATCH_SIZE: z.preprocess((value) => Number(value ?? 50), z.number().int().min(1).max(50)),
    WORKER_STARTUP_DELAY_MS: z.preprocess((value) => Number(value ?? 5 * 60 * 1_000), z.number().int().min(0)),
    WORKER_STALE_ACTIVE_RECOVERY_DELAY_MS: z.preprocess((value) => Number(value ?? 30 * 60 * 1_000), z.number().int().positive()),
    WORKER_ACTIVE_RECOVERY_LOCK_TTL_MS: z.preprocess((value) => Number(value ?? 60_000), z.number().int().positive()),
    WORKER_IMPORT_USER_LIBRARY_INTERVAL_MS: z.preprocess((value) => Number(value ?? 7 * 24 * 60 * 60 * 1_000), z.number().int().positive()),
    WORKER_SYNC_STEAM_GAMES_CRON: z.string().min(1).default("0 3 * * 0"),
    WORKER_REFRESH_GAME_DETAILS_CRON: z.string().min(1).default("0 0 * * *"),
    WORKER_SYNC_STEAM_TAGS_CRON: z.string().min(1).default("0 2 * * 0"),
    WORKER_SYNC_STEAM_CATEGORIES_CRON: z.string().min(1).default("0 2 * * 0"),
    WORKER_GAME_DETAILS_REFRESH_DAYS: z.preprocess((value) => Number(value ?? 30), z.number().int().positive()),
    WORKER_STEAM_RATE_LIMIT_MAX: z.preprocess((value) => Number(value ?? 200), z.number().int().positive()),
    WORKER_STEAM_RATE_LIMIT_WINDOW_MS: z.preprocess((value) => Number(value ?? 5 * 60 * 1_000), z.number().int().positive()),
    WORKER_STEAM_RATE_LIMIT_MIN_INTERVAL_MS: z.preprocess((value) => Number(value ?? 500), z.number().int().min(0)),
    WORKER_STEAM_RATE_LIMIT_SCOPE: z.enum(["local", "distributed"]).default("local"),
});

/**
 * Validated and typed worker environment variables, inferred from {@link workerEnvSchema}.
 */
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Cached environment after first successful validation. */
let cachedEnv: WorkerEnv | null = null;

/**
 * Validates all worker environment variables against the Zod schema.
 *
 * On success the validated values are cached internally so subsequent
 * calls to {@link getWorkerEnv} return immediately without reparsing.
 *
 * @returns A Zod `SafeParseReturnType` — check `.success` before accessing `.data`.
 */
export function validateWorkerEnv() {
    const result = workerEnvSchema.safeParse(process.env);

    if (result.success) {
        cachedEnv = result.data;
    }

    return result;
}

/**
 * Returns the validated worker environment variables.
 *
 * If the environment has not yet been validated, performs validation first.
 *
 * @returns The validated {@link WorkerEnv} object.
 * @throws {Error} If environment validation fails (missing or invalid variables).
 */
export function getWorkerEnv(): WorkerEnv {
    if (cachedEnv) {
        return cachedEnv;
    }

    const result = validateWorkerEnv();
    if (!result.success) {
        throw new Error("Worker environment has not been validated successfully.");
    }

    return result.data;
}