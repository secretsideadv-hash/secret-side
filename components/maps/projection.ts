import type { LatLng } from "./types";

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320;

export interface Box {
  width: number;
  height: number;
  padding: number;
}

/**
 * Fit points into a box (local equirectangular projection; fine at city scale).
 * North is up. The view always spans at least `minSpanMeters`, so a single stop
 * isn't zoomed in to nothing. Returns pixel coordinates in the same order.
 */
export function fitPoints(points: readonly LatLng[], box: Box, minSpanMeters = 400): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  const meters = points.map((p) => ({
    x: (p.lng - midLng) * METERS_PER_DEG_LNG_AT_EQUATOR * cosLat,
    y: (p.lat - midLat) * METERS_PER_DEG_LAT,
  }));
  const spanX = Math.max(minSpanMeters, ...meters.map((m) => Math.abs(m.x) * 2));
  const spanY = Math.max(minSpanMeters, ...meters.map((m) => Math.abs(m.y) * 2));
  const scale = Math.min((box.width - 2 * box.padding) / spanX, (box.height - 2 * box.padding) / spanY);

  return meters.map((m) => ({
    x: box.width / 2 + m.x * scale,
    y: box.height / 2 - m.y * scale, // screen y grows downwards
  }));
}
