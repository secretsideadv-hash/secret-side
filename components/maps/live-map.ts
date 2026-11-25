/**
 * The live map: MapLibre GL JS with OpenFreeMap vector tiles and our own dark
 * style (public/map/secret-side-dark.json, 3D buildings). Imported dynamically
 * by <MapView> only when a map is on screen and WebGL works, so MapLibre never
 * weighs on pages without a map.
 *
 * Fails fast to the static map: any error before the first full render, no
 * render within 8 s, or a lost WebGL context.
 */
import { getVersion, LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapMarker, PlayerPosition } from "./types";

export type MapMode = "3d" | "2d";

export interface LiveMapOptions {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  player: PlayerPosition | null;
  zoom: number;
  pitch: number;
  bearing: number;
  interactive: boolean;
  mode: MapMode;
}

export interface LiveMap {
  update(markers: MapMarker[], player: PlayerPosition | null): void;
  setMode(mode: MapMode): void;
  /** Zoom out to fit the player and the camera target (normally the current stop). */
  showPlayer(): void;
  /** After the container moved or changed size (the full-screen map). */
  resize(): void;
  /** Two-finger panning in a scrolling page (card); one finger in full screen. */
  setCooperativeGestures(on: boolean): void;
  destroy(): void;
}

const STYLE_URL = "/map/secret-side-dark.json";
const LOAD_TIMEOUT_MS = 8_000;
const BUILDINGS_3D = "building-3d";
const PLAYER_SOURCE = "player";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Stop pins as DOM elements: amber pin for the current stop, green dot for completed ones. */
function markerElement(m: MapMarker): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", m.label);
  el.dataset.mapMarker = m.kind;
  const number = document.createElement("span");
  number.textContent = String(m.position);
  if (m.kind === "current") {
    el.className = "relative flex h-9 w-7 items-start justify-center";
    el.innerHTML =
      '<svg viewBox="0 0 28 36" class="absolute inset-0 size-full drop-shadow" aria-hidden="true"><path d="M14 35C14 35 1 22 1 13.5A13 13 0 0 1 27 13.5C27 22 14 35 14 35Z" fill="#F2A93B" stroke="#0E1320" stroke-width="1.5"/></svg>';
    number.className = "relative mt-1.5 text-[12px] font-bold text-on-amber";
  } else {
    el.className =
      "flex size-6 items-center justify-center rounded-full border-2 border-success bg-surface text-[11px] font-bold text-success";
  }
  el.append(number);
  return el;
}

/** Accuracy ring radius in pixels: metres → pixels at each zoom (Web Mercator, at this latitude). */
type ZoomScaled = ["interpolate", ["exponential", number], ["zoom"], number, number, number, number];

function accuracyRadius(player: PlayerPosition): ZoomScaled {
  const metresPerPixelAtZoom0 = 78_271.484 * Math.cos((player.lat * Math.PI) / 180);
  const atZoom0 = player.accuracyM / metresPerPixelAtZoom0;
  return ["interpolate", ["exponential", 2], ["zoom"], 0, atZoom0, 22, atZoom0 * 2 ** 22];
}

type PlayerData = Parameters<GeoJSONSource["setData"]>[0];

function playerData(player: PlayerPosition | null): PlayerData {
  return {
    type: "FeatureCollection",
    features: player
      ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [player.lng, player.lat] } }]
      : [],
  };
}

export function createLiveMap(
  container: HTMLElement,
  options: LiveMapOptions,
  events: {
    onReady: () => void;
    onFail: (reason: string) => void;
    /** Whether the player's dot is inside the visible map (null: no position). */
    onPlayerInView?: (inView: boolean | null) => void;
  },
): LiveMap {
  // Our own copy of the worker (scripts/copy-map-worker.mjs), so the CSP needs no blob: workers.
  setWorkerUrl(`/vendor/maplibre-gl-worker-${getVersion()}.mjs`);

  let ready = false;
  let finished = false;
  let mode = options.mode;
  let player = options.player;
  let markers = options.markers;
  let stopMarkers: Marker[] = [];

  const fail = (reason: string) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    events.onFail(reason);
  };

  const map = new MapLibreMap({
    container,
    style: STYLE_URL,
    center: [options.center.lng, options.center.lat],
    zoom: options.zoom,
    pitch: mode === "3d" ? options.pitch : 0,
    bearing: options.bearing,
    minZoom: 12,
    maxZoom: 19,
    maxPitch: 70,
    interactive: options.interactive,
    cooperativeGestures: options.interactive, // two fingers to move: the page keeps scrolling
    attributionControl: { compact: false }, // OpenStreetMap / OpenMapTiles credit always visible
    fadeDuration: 0,
  });

  const timer = setTimeout(() => fail("timeout"), LOAD_TIMEOUT_MS);
  map.on("error", (event) => {
    if (!ready) fail(`error: ${event.error?.message ?? "unknown"}`);
  });
  map.on("webglcontextlost", () => fail("webgl-context-lost"));

  function placeMarkers(list: MapMarker[]) {
    for (const m of stopMarkers) m.remove();
    stopMarkers = list.map((m) =>
      new Marker({ element: markerElement(m), anchor: m.kind === "current" ? "bottom" : "center" })
        .setLngLat([m.lng, m.lat])
        .addTo(map),
    );
  }

  function applyMode(animate: boolean) {
    if (!map.getLayer(BUILDINGS_3D)) return;
    map.setLayoutProperty(BUILDINGS_3D, "visibility", mode === "3d" ? "visible" : "none");
    map.easeTo({ pitch: mode === "3d" ? options.pitch : 0, duration: animate && !reducedMotion() ? 600 : 0 });
  }

  function fitToStops(list: MapMarker[]) {
    if (list.length < 2) return;
    const bounds = new LngLatBounds();
    for (const m of list) bounds.extend([m.lng, m.lat]);
    map.fitBounds(bounds, { padding: 48, maxZoom: options.zoom, duration: 0, pitch: mode === "3d" ? options.pitch : 0 });
  }

  function reportPlayerInView() {
    events.onPlayerInView?.(player ? map.getBounds().contains([player.lng, player.lat]) : null);
  }

  function showPlayer() {
    const source = map.getSource<GeoJSONSource>(PLAYER_SOURCE);
    source?.setData(playerData(player));
    if (player && map.getLayer("player-accuracy")) {
      map.setPaintProperty("player-accuracy", "circle-radius", accuracyRadius(player));
    }
  }

  map.on("load", () => {
    if (finished) return;
    ready = true;
    clearTimeout(timer);
    map.addSource(PLAYER_SOURCE, { type: "geojson", data: playerData(player) });
    map.addLayer({
      id: "player-accuracy",
      type: "circle",
      source: PLAYER_SOURCE,
      paint: {
        "circle-radius": player ? accuracyRadius(player) : 0,
        "circle-color": "#5B8DEF",
        "circle-opacity": 0.15,
        "circle-stroke-color": "#5B8DEF",
        "circle-stroke-opacity": 0.4,
        "circle-stroke-width": 1,
        "circle-pitch-alignment": "map",
      },
    });
    map.addLayer({
      id: "player-dot",
      type: "circle",
      source: PLAYER_SOURCE,
      paint: { "circle-radius": 7, "circle-color": "#5B8DEF", "circle-stroke-color": "#F3EEE4", "circle-stroke-width": 2 },
    });
    placeMarkers(markers);
    fitToStops(markers);
    applyMode(false);
    map.on("moveend", reportPlayerInView);
    map.on("resize", reportPlayerInView);
    events.onReady();
    reportPlayerInView();
  });

  return {
    update(nextMarkers, nextPlayer) {
      markers = nextMarkers;
      player = nextPlayer;
      if (!ready) return;
      placeMarkers(markers);
      showPlayer();
      reportPlayerInView();
    },
    showPlayer() {
      if (!ready || !player) return;
      const bounds = new LngLatBounds().extend([player.lng, player.lat]).extend([options.center.lng, options.center.lat]);
      map.fitBounds(bounds, {
        padding: { top: 72, bottom: 84, left: 40, right: 40 },
        maxZoom: options.zoom,
        duration: reducedMotion() ? 0 : 800,
      });
    },
    resize() {
      if (finished) return;
      map.resize();
      if (ready) reportPlayerInView();
    },
    setCooperativeGestures(on) {
      if (!options.interactive || finished) return;
      if (on) map.cooperativeGestures.enable();
      else map.cooperativeGestures.disable();
    },
    setMode(next) {
      mode = next;
      if (ready) applyMode(true);
    },
    destroy() {
      finished = true;
      clearTimeout(timer);
      for (const m of stopMarkers) m.remove();
      map.remove();
    },
  };
}
