import { afterEach, vi } from "vitest";

// ioredis opens a real socket on construction. Several modules build clients at
// import time, so without this every suite that touches them emits connection
// errors and retries in the background.
vi.mock("ioredis", () => {
    class RedisMock {
        status = "ready";
        on() {
            return this;
        }
        once() {
            return this;
        }
        off() {
            return this;
        }
        removeListener() {
            return this;
        }
        async ping() {
            return "PONG";
        }
        async get() {
            return null;
        }
        async set() {
            return "OK";
        }
        async del() {
            return 0;
        }
        async incr() {
            return 1;
        }
        async expire() {
            return 1;
        }
        async eval() {
            return null;
        }
        async zadd() {
            return 1;
        }
        async zcard() {
            return 0;
        }
        async zremrangebyscore() {
            return 0;
        }
        async quit() {
            return "OK";
        }
        async disconnect() {
            return undefined;
        }
        duplicate() {
            return new RedisMock();
        }
        defineCommand() {
            return undefined;
        }
    }
    return { default: RedisMock, Redis: RedisMock };
});

// Deterministic defaults for anything that reads configuration at import time.
// LOG_LEVEL is deliberately left alone so tests can exercise the logger's own
// default resolution; individual tests stub it with vi.stubEnv where needed.
process.env.LOG_FILE_ENABLED ??= "false";
process.env.NODE_ENV ??= "test";

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});
