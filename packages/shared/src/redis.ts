export interface SharedRedisOptions {
    host: string;
    port: number;
    password?: string;
    username?: string;
    maxRetriesPerRequest: null;
}

export function createRedisOptions(env: NodeJS.ProcessEnv = process.env): SharedRedisOptions {
    return {
        host: env.REDIS_HOST!,
        port: Number(env.REDIS_PORT ?? 6379),
        password: env.REDIS_PASSWORD ?? undefined,
        username: env.REDIS_USERNAME ?? undefined,
        maxRetriesPerRequest: null,
    };
}

