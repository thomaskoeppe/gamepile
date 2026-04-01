import { z } from "zod";

const schema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"])
        .default("development")
        .describe("Node environment. Controls Prisma singleton behaviour and default log labels."),

    DOMAIN: z.string()
        .describe("Public DNS host used by docker-compose for WEB_APP_URL. Only hostname and subdomains, no protocol or path.")
        .refine(val => /^(localhost|([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(:\d+)?$/.test(val), {
            message: "DOMAIN must be a valid hostname or subdomain (no protocol, no path)",
        }),

    DATABASE_URL: z.string()
        .refine(val => {
            try {
                const url = new URL(val);
                return url.protocol === "postgresql:";
            } catch {
                return false;
            }
        }, {
            message: "DATABASE_URL must be a valid PostgreSQL connection string",
        })
        .describe("PostgreSQL connection string used by Prisma in both the web and worker packages."),

    REDIS_HOST: z.string()
        .default("localhost")
        .refine(val => val.length > 0, { message: "REDIS_HOST cannot be empty" })
        .describe("Redis host used for middleware rate limits, SSE coordination, BullMQ queues, and worker jobs."),

    REDIS_PORT: z.preprocess(val => Number(val), z.number().int().min(1).max(65535)
        .refine(n => !isNaN(n), { message: "REDIS_PORT must be a number" })
    ),

    REDIS_PASSWORD: z.string()
        .optional()
        .describe("Redis password. Leave empty for local unsecured Redis. Required for production."),

    REDIS_USERNAME: z.string()
        .optional()
        .describe("Redis ACL username when the provider requires one."),

    STEAM_API_KEY: z.string()
        .refine(val => /^[A-Fa-f0-9]{32}$/.test(val), {
            message: "STEAM_API_KEY must be a 32-character hex string",
        })
        .describe("Steam Web API key used for profile metadata, owned-games lookups, and catalog sync."),

    OTEL_EXPORTER_OTLP_ENDPOINT: z.string()
        .optional()
        .refine(val => !val || /^https?:\/\/.+$/.test(val), {
            message: "OTEL_EXPORTER_OTLP_ENDPOINT must be a valid URL",
        })
        .describe("Base OTLP endpoint for traces and logs export."),

    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string()
        .optional()
        .refine(val => !val || /^https?:\/\/.+$/.test(val), {
            message: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT must be a valid URL",
        })
        .describe("Explicit traces endpoint. Falls back to OTEL_EXPORTER_OTLP_ENDPOINT if omitted."),

    OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: z.enum(["http/protobuf", "grpc"])
        .default("http/protobuf")
        .describe("Protocol for the traces exporter."),

    OTEL_EXPORTER_OTLP_HEADERS: z.string()
        .optional()
        .refine(val => {
            if (!val) return true;
            return val
                .split(",")
                .every(item => /^[^=]+=[^=]+$/.test(item.trim()));
        }, {
            message: "OTEL_EXPORTER_OTLP_HEADERS must be comma-separated key=value pairs",
        })
        .describe("Comma-separated key=value pairs sent as HTTP headers on OTLP export requests."),

    OTEL_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"])
        .default("info")
        .describe("OTLP SDK log verbosity."),

    NEXT_OTEL_VERBOSE: z.preprocess(val => Number(val ?? 0), z.number().int().min(0).max(1).default(0))
        .describe("Set to 1 for verbose OTel debug output in Next.js."),

    PRISMA_LOG_QUERIES: z.enum(["true", "false"])
        .default("true")
        .describe("Enable Prisma query-event logging for slow query warnings in web and worker services."),

    WEB_APP_URL: z.string()
        .refine(val => /^https?:\/\/\S+$/.test(val), {
            message: "WEB_APP_URL must be a valid URL including protocol",
        })
        .describe("Public application URL used for OpenID callbacks, sitemap URL generation, and Next.js server-action origin allow-list."),

    WEB_ALLOWED_ORIGINS: z.string()
        .optional()
        .refine(val => {
            if (!val) return true;

            return val
                .split(",")
                .map(v => v.trim())
                .every(host =>
                    /^(localhost|([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(:\d+)?$/.test(host)
                );
        }, {
            message: "WEB_ALLOWED_ORIGINS must be a comma-separated list of hostnames (optionally with ports)",
        })
        .describe("Comma-separated hostname allow-list for Next.js Server Actions forwarding."),

    WEB_SESSION_COOKIE_NAME: z.string()
        .default("__session")
        .refine(val => val.length > 0, { message: "WEB_SESSION_COOKIE_NAME cannot be empty" })
        .describe("Name of the primary auth session cookie."),

    WEB_SESSION_DURATION_DAYS: z.preprocess(val => Number(val ?? 7), z.number().int().min(1).max(365).default(7))
        .describe("Session lifetime in days."),

    WEB_VAULT_TOKEN_SECRET: z.string()
        .refine(val => val.length >= 32, { message: "WEB_VAULT_TOKEN_SECRET should be at least 32 characters for security" })
        .describe("HMAC secret for per-vault access cookies. Required for production."),
});

export const validateEnv = () => schema.safeParse(process.env);