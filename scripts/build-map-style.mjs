#!/usr/bin/env node
/**
 * Builds our map style, public/map/secret-side-dark.json, from OpenFreeMap's
 * "dark" style (MapLibre style spec; data © OpenMapTiles © OpenStreetMap).
 *
 *   npm run map:style
 *
 * - recolours every layer to our design tokens (night ground, azulejo water,
 *   muted labels);
 * - adds 3D buildings (fill-extrusion from the tiles' render_height);
 * - drops the low-zoom shaded-relief raster (we never zoom out that far).
 *
 * The output is committed, so builds never depend on fetching it. Tiles, fonts
 * and sprites still come from tiles.openfreemap.org at runtime (CSP allow-listed).
 */
import { mkdirSync, writeFileSync } from "node:fs";

const SOURCE = "https://tiles.openfreemap.org/styles/dark";
const OUT = "public/map/secret-side-dark.json";

const C = {
  ground: "#0E1320",
  raised: "#121827",
  building: "#1A2131",
  building3d: "#2A3347",
  water: "#16233D",
  green: "#131D22",
  roadMinor: "#232B3D",
  roadMajor: "#2F3A52",
  roadCasing: "#3A4560",
  roadInner: "#1C2334",
  rail: "#2A3347",
  label: "#A3ABBD",
  labelRoad: "#8A93A8",
  labelWater: "#4E6FA8",
};

/** Paint overrides by layer id (exact) or id prefix (ending in *). */
const PAINT = {
  background: { "background-color": C.ground },
  water: { "fill-color": C.water },
  waterway: { "line-color": C.water },
  landcover_ice_shelf: { "fill-color": C.ground },
  landcover_glacier: { "fill-color": C.ground },
  landuse_residential: { "fill-color": C.raised },
  landcover_wood: { "fill-color": C.green },
  landuse_park: { "fill-color": C.green },
  building: { "fill-color": C.building },
  road_area_pier: { "fill-color": C.ground },
  road_pier: { "line-color": C.ground },
  highway_path: { "line-color": C.roadMinor },
  highway_minor: { "line-color": C.roadMinor },
  highway_major_casing: { "line-color": C.roadCasing },
  highway_major_inner: { "line-color": C.roadInner },
  highway_major_subtle: { "line-color": C.roadMajor },
  highway_motorway_casing: { "line-color": C.roadCasing },
  highway_motorway_inner: { "line-color": C.roadInner },
  highway_motorway_subtle: { "line-color": C.roadMajor },
  "railway*": { "line-color": C.rail },
  "railway_*dashline": { "line-color": C.ground },
  water_name: { "text-color": C.labelWater, "text-halo-color": C.ground },
  "highway_name*": { "text-color": C.labelRoad, "text-halo-color": C.ground },
  "place_*": { "text-color": C.label, "text-halo-color": C.ground },
};

function overridesFor(id) {
  const matches = Object.entries(PAINT).filter(([key]) => {
    if (!key.includes("*")) return key === id;
    const [start, end] = key.split("*");
    return id.startsWith(start) && id.endsWith(end);
  });
  // Exact keys win over patterns; longer patterns win over shorter ones.
  matches.sort(([a], [b]) => (a.includes("*") ? a.length : 1e6) - (b.includes("*") ? b.length : 1e6));
  return Object.assign({}, ...matches.map(([, paint]) => paint));
}

const BUILDING_3D = {
  id: "building-3d",
  type: "fill-extrusion",
  source: "openmaptiles",
  "source-layer": "building",
  minzoom: 14,
  filter: ["!", ["has", "hide_3d"]],
  paint: {
    "fill-extrusion-color": C.building3d,
    "fill-extrusion-height": ["get", "render_height"],
    "fill-extrusion-base": ["get", "render_min_height"],
    "fill-extrusion-opacity": 0.92,
    "fill-extrusion-vertical-gradient": true,
  },
};

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Fetching ${SOURCE} failed: ${res.status}`);
const base = await res.json();

const rasterSources = Object.entries(base.sources)
  .filter(([, s]) => s.type === "raster" || s.type === "raster-dem")
  .map(([name]) => name);

const layers = [];
for (const layer of base.layers) {
  if (rasterSources.includes(layer.source)) continue;
  layers.push({ ...layer, paint: { ...layer.paint, ...overridesFor(layer.id) } });
  if (layer.id === "building") layers.push(BUILDING_3D);
}
if (!layers.some((l) => l.id === "building-3d")) throw new Error("No 'building' layer found to put 3D buildings after");

const style = {
  version: 8,
  name: "Secret Side dark",
  metadata: {
    "secret-side:generated-by": "scripts/build-map-style.mjs",
    "secret-side:based-on": SOURCE,
  },
  sources: Object.fromEntries(Object.entries(base.sources).filter(([name]) => !rasterSources.includes(name))),
  glyphs: base.glyphs,
  sprite: base.sprite,
  layers,
};

mkdirSync("public/map", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(style, null, 2)}\n`);
console.log(`Wrote ${OUT}: ${layers.length} layers, sources: ${Object.keys(style.sources).join(", ")}`);
