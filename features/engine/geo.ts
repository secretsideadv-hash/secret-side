/**
 * GAME_RULES §5: distances and the GPS check-in decision. Pure, no I/O.
 * The browser only proposes a position; the server decides with these rules.
 */
import { RULES } from "./rules";
import type { GpsCheckInOutcome, GpsFix } from "./types";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius (IUGG), metres. */
const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle (haversine) distance in metres. Accurate to well under a metre at city scale. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Decides a GPS check-in, in this order:
 * 1. fix older than 60 s (or from the future beyond clock jitter) → stale_fix
 * 2. accuracy worse than 100 m → inaccurate
 * 3. accepted if distance − min(accuracy, 35 m) ≤ radius; otherwise too_far
 *    with the distance rounded to 10 m.
 */
export function decideGpsCheckIn(target: LatLng & { checkInRadiusM: number }, fix: GpsFix): GpsCheckInOutcome {
  if (fix.ageMs > RULES.gpsMaxFixAgeMs || fix.ageMs < -RULES.gpsFixFutureToleranceMs) {
    return { outcome: "stale_fix" };
  }
  if (fix.accuracyM > RULES.gpsMaxAccuracyM) {
    return { outcome: "inaccurate", accuracyM: Math.ceil(fix.accuracyM) };
  }
  const distance = distanceMeters(target, fix);
  const allowance = Math.min(fix.accuracyM, RULES.gpsAccuracyAllowanceCapM);
  if (distance - allowance <= target.checkInRadiusM) {
    return { outcome: "checked_in", distanceM: Math.round(distance), accuracyM: Math.ceil(fix.accuracyM) };
  }
  return { outcome: "too_far", distanceM: roundTo(distance, RULES.gpsDistanceRoundingM) };
}
