import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests run against the DEV project (secret-side-dev) with keys from .env.local.
const envFile = fileURLToPath(new URL("./.env.local", import.meta.url));
const env = existsSync(envFile) ? (parseEnv(readFileSync(envFile, "utf8")) as Record<string, string>) : {};

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    env,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
