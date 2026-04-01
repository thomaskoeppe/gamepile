import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node22",
    outDir: "dist",
    clean: true,
    sourcemap: true,
    splitting: false,
    tsconfig: "tsconfig.json",
    // Bundle workspace packages (@gamepile/*) inline so the runner image
    // does not need a separate @gamepile/shared package at runtime.
    noExternal: [/@gamepile\//],
});

