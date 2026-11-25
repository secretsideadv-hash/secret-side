#!/usr/bin/env node
/**
 * Serves MapLibre's web worker from our own origin (public/vendor/), so the CSP
 * can keep `worker-src 'self'` instead of allowing blob: workers. Runs before
 * `dev` and `build`. The file name carries the MapLibre version, so a library
 * upgrade gets a new URL (no stale cached worker). Output is gitignored.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";

const { version } = JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8"));
const dir = "public/vendor";
mkdirSync(dir, { recursive: true });
for (const old of readdirSync(dir)) if (old.startsWith("maplibre-gl-worker")) rmSync(`${dir}/${old}`);
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", `${dir}/maplibre-gl-worker-${version}.mjs`);
console.log(`Copied MapLibre ${version} worker to ${dir}/`);
