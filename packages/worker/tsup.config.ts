import {defineConfig} from "tsup";

/**
 * tsup build configuration for the worker package.
 *
 * Bundles the worker entry point as a single ESM file targeting Node.js 22.
 * Workspace packages (`@gamepile/*`) are inlined so the production Docker image
 * does not need a separate `@gamepile/shared` package at runtime.
 */

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node22",
    outDir: "dist",
    clean: true,
    sourcemap: true,
    splitting: false,
    tsconfig: "tsconfig.json",
    noExternal: [/@gamepile\//],
});
