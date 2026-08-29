import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const webDir = fileURLToPath(new URL("./packages/web", import.meta.url));
const workerDir = fileURLToPath(new URL("./packages/worker", import.meta.url));
const serverOnlyStub = fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url));

/**
 * Files whose coverage is reported and enforced: every server-side module in
 * both packages. React components and page files are excluded — they are
 * predominantly presentational and are covered by the build and typecheck.
 */
const coverageInclude = [
    "packages/shared/src/**/*.ts",
    "packages/worker/src/**/*.ts",
    "packages/web/lib/**/*.ts",
    "packages/web/server/**/*.ts",
    "packages/web/app/api/**/*.ts",
    "packages/web/types/**/*.ts",
];

export default defineConfig({
    resolve: {
        alias: [
            // The worker's tsconfig maps `@/*` to the package root, so its source
            // imports read `@/src/...`. That prefix is matched first, otherwise the
            // web rule below would swallow it and resolve into packages/web.
            { find: /^@\/src\/(.*)$/, replacement: `${workerDir}/src/$1` },
            // Mirrors the `@/*` path mapping in packages/web/tsconfig.json.
            { find: /^@\/(.*)$/, replacement: `${webDir}/$1` },
            // `server-only` throws outside an RSC context; swap it for a no-op.
            { find: /^server-only$/, replacement: serverOnlyStub },
        ],
        // Worker sources are ESM-with-.js-specifiers (NodeNext); resolve those
        // back to their TypeScript sources, as next.config.ts does for the build.
        extensionAlias: {
            ".js": [".ts", ".js"],
        },
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
                "packages/worker/src/lib/logs-exporter.ts",
                // Process entry points: they wire modules together and install
                // signal handlers, so exercising them starts a real worker.
                "packages/worker/src/index.ts",
                "packages/worker/src/instrumentation.ts",
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
                "packages/web/lib/auth/steam.ts": {
                    statements: 80,
                    branches: 75,
                    functions: 80,
                    lines: 80,
                },
                // The Steam boundary: every parsing and error branch here runs
                // against hostile input, because this is where a malformed
                // upstream payload used to take a whole job down.
                "packages/worker/src/lib/steam/{mappers,achievements}.ts": {
                    statements: 90,
                    branches: 85,
                    functions: 90,
                    lines: 90,
                },
                // Auth and authorization boundaries: a hole in any of these is a
                // hole in every query, mutation or vault unlock built on them.
                "packages/web/lib/auth/{session,vault/token,vault/lockout}.ts": {
                    statements: 85,
                    branches: 75,
                    functions: 85,
                    lines: 85,
                },
                "packages/web/server/{query,actions}.ts": {
                    statements: 85,
                    branches: 75,
                    functions: 85,
                    lines: 85,
                },
                "packages/web/lib/with-logging.ts": {
                    statements: 85,
                    branches: 75,
                    functions: 85,
                    lines: 85,
                },
                "packages/worker/src/{handlers,lib/job}/**": {
                    statements: 80,
                    branches: 70,
                    functions: 80,
                    lines: 80,
                },
                "packages/worker/src/lib/steam/api/**": {
                    statements: 90,
                    branches: 85,
                    functions: 90,
                    lines: 90,
                },
            },
        },
    },
});
