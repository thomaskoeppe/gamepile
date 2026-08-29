import { describe, expect, it } from "vitest";

import { createRedisOptions } from "../redis.js";

describe("createRedisOptions", () => {
    it("falls back to a local Redis when nothing is configured", () => {
        expect(createRedisOptions({})).toEqual({
            host: "localhost",
            port: 6379,
            password: undefined,
            username: undefined,
            maxRetriesPerRequest: null,
        });
    });

    it("reads host, port and credentials from the environment", () => {
        expect(
            createRedisOptions({
                REDIS_HOST: "redis.internal",
                REDIS_PORT: "6380",
                REDIS_PASSWORD: "s3cret",
                REDIS_USERNAME: "gamepile",
            }),
        ).toMatchObject({
            host: "redis.internal",
            port: 6380,
            password: "s3cret",
            username: "gamepile",
        });
    });

    it("coerces the port to a number", () => {
        expect(createRedisOptions({ REDIS_PORT: "6380" }).port).toBe(6380);
    });

    it("keeps maxRetriesPerRequest null, which BullMQ requires", () => {
        expect(createRedisOptions({}).maxRetriesPerRequest).toBeNull();
    });
});
