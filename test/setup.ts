import { afterEach, vi } from "vitest";

// Deterministic defaults for anything that reads configuration at import time.
// LOG_LEVEL is deliberately left alone so tests can exercise the logger's own
// default resolution; individual tests stub it with vi.stubEnv where needed.
process.env.LOG_FILE_ENABLED ??= "false";
process.env.NODE_ENV ??= "test";

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});
