export interface SharedRedisOptions {
    host: string;
    port: number;
    password?: string;
    username?: string;
    maxRetriesPerRequest: null;
}

/** Subset of process.env keys needed for Redis configuration. */
export interface RedisEnvVars {
    REDIS_HOST?: string;
    REDIS_PORT?: string;
    REDIS_PASSWORD?: string;
    REDIS_USERNAME?: string;
}

export function createRedisOptions(env?: RedisEnvVars): SharedRedisOptions {
    const resolvedEnv = env ?? (globalThis as { process?: { env?: RedisEnvVars } }).process?.env ?? {};
    return {
        host: resolvedEnv.REDIS_HOST ?? "localhost",
        port: Number(resolvedEnv.REDIS_PORT ?? 6379),
        password: resolvedEnv.REDIS_PASSWORD ?? undefined,
        username: resolvedEnv.REDIS_USERNAME ?? undefined,
        maxRetriesPerRequest: null,
    };
}

