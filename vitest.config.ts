import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const webDir = fileURLToPath(new URL("./packages/web", import.meta.url));
const serverOnlyStub = fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url));

/**
 * Files whose coverage is enforced. This list is deliberately narrower than the
 * codebase: it covers the server-side logic the suite actually exercises, and is
 * meant to be widened as tests are added rather than set to everything at once.
 */
const coverageInclude = [
    "packages/shared/src/**/*.ts",
    "packages/web/lib/**/*.ts",
    "packages/web/server/lib/**/*.ts",
    "packages/web/app/api/**/*.ts",
    "packages/web/types/**/*.ts",
];

export default defineConfig({
    resolve: {
        alias: [
            // Mirrors the `@/*` path mapping in packages/web/tsconfig.json.
            { find: /^@\/(.*)$/, replacement: `${webDir}/$1` },
            // `server-only` throws outside an RSC context; swap it for a no-op.
            { find: /^server-only$/, replacement: serverOnlyStub },
        ],
    },
    test: {
        globals: true,
        environment: "node",
        include: ["packages/*/**/*.test.ts", "test/**/*.test.ts"],
        exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/prisma/generated/**"],
        setupFiles: [fileURLToPath(new URL("./test/setup.ts", import.meta.url))],
        // Log sinks and settings caches live on globalThis, so tests must not
        // share a process or they will observe each other's state.
        isolate: true,
        pool: "forks",
        root: rootDir,
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "json-summary", "html"],
            reportsDirectory: "./coverage",
            include: coverageInclude,
            exclude: [
                "**/*.d.ts",
                "**/*.test.ts",
                "**/prisma/generated/**",
                // Thin composition roots over third-party SDKs — exercising them
                // would test the SDK, not this codebase.
                "packages/web/lib/logs-exporter.ts",
                "packages/shared/src/logs-exporter.ts",
                "packages/web/lib/browser-logger.ts",
            ],
            thresholds: {
                // Scoped, ratchetable gates: each glob is held to a level the
                // current suite actually reaches, so a regression fails CI.
                "packages/shared/src/{logger,log-sinks,file-logger,redis}.ts": {
                    statements: 80,
                    branches: 70,
                    functions: 80,
                    lines: 80,
                },
                "packages/web/lib/{sse,slug,utils}.ts": {
                    statements: 80,
                    branches: 70,
                    functions: 80,
                    lines: 80,
                },
                "packages/web/lib/auth/{crypto,redirect}.ts": {
                    statements: 80,
                    branches: 70,
                    functions: 80,
                    lines: 80,
                },
                "packages/web/lib/app-settings.ts": {
                    statements: 85,
                    branches: 80,
                    functions: 85,
                    lines: 85,
                },
                "packages/web/server/lib/**": {
                    statements: 90,
                    branches: 80,
                    functions: 90,
                    lines: 90,
                },
            },
        },
    },
});
