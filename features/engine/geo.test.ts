import { describe, expect, it } from "vitest";
import { decideGpsCheckIn, distanceMeters } from "./geo";
import { RULES } from "./rules";
import type { GpsFix } from "./types";

/** Ribeira, Porto (mock stop 1 coordinates). */
const STOP = { lat: 41.1407, lng: -8.6131, checkInRadiusM: 75 };
const METRES_PER_DEGREE_LAT = (Math.PI / 180) * 6_371_008.8;

/** A fix `metres` due north of the stop. */
const north = (metres: number, accuracyM: number, ageMs = 1_000): GpsFix => ({
  lat: STOP.lat + metres / METRES_PER_DEGREE_LAT,
  lng: STOP.lng,
  accuracyM,
  ageMs,
});

describe("distanceMeters", () => {
  it("is zero for the same point and symmetric", () => {
    expect(distanceMeters(STOP, STOP)).toBe(0);
    const a = { lat: 41.1407, lng: -8.6131 };
    const b = { lat: 41.1457, lng: -8.6108 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });

  it("matches known distances", () => {
    // One degree of latitude ≈ 111.195 km on the mean-radius sphere.
    expect(distanceMeters({ lat: 41, lng: -8.6 }, { lat: 42, lng: -8.6 })).toBeCloseTo(111_195, -1);
    // At Porto's latitude, 0.01° of longitude ≈ 838 m (cos 41.14° × 1111.95 m × 0.01 / 0.01).
    expect(distanceMeters({ lat: 41.14, lng: -8.62 }, { lat: 41.14, lng: -8.61 })).toBeCloseTo(837.5, 0);
    expect(distanceMeters(STOP, north(200, 5))).toBeCloseTo(200, 3);
  });
});

describe("decideGpsCheckIn (GAME_RULES §5)", () => {
  it.each([
    // [what, fix, expected outcome]
    ["at the door with a good fix", north(5, 8), "checked_in"],
    ["on the edge of the radius", north(75, 3), "checked_in"],
    ["outside the radius but within the accuracy allowance", north(100, 30), "checked_in"],
    ["at the maximum the allowance allows (75 + 35 m)", north(109.9, 60), "checked_in"],
    ["the allowance is capped at 35 m however bad the fix", north(115, 90), "too_far"],
    ["just outside with a precise fix", north(80, 3), "too_far"],
    ["far away", north(640, 10), "too_far"],
  ] as const)("%s → %s", (_what, fix, expected) => {
    expect(decideGpsCheckIn(STOP, fix).outcome).toBe(expected);
  });

  it("reports the distance rounded to 10 m when too far, and exact metres when checked in", () => {
    expect(decideGpsCheckIn(STOP, north(643, 10))).toEqual({ outcome: "too_far", distanceM: 640 });
    expect(decideGpsCheckIn(STOP, north(42.4, 12.2))).toEqual({ outcome: "checked_in", distanceM: 42, accuracyM: 13 });
  });

  it("rejects fixes less accurate than 100 m, even right at the stop", () => {
    expect(decideGpsCheckIn(STOP, north(0, RULES.gpsMaxAccuracyM + 1))).toEqual({ outcome: "inaccurate", accuracyM: 101 });
    expect(decideGpsCheckIn(STOP, north(0, RULES.gpsMaxAccuracyM)).outcome).toBe("checked_in");
  });

  it("rejects fixes older than 60 s or from the future, before anything else", () => {
    expect(decideGpsCheckIn(STOP, north(0, 5, 60_001))).toEqual({ outcome: "stale_fix" });
    expect(decideGpsCheckIn(STOP, north(0, 5, 60_000)).outcome).toBe("checked_in");
    expect(decideGpsCheckIn(STOP, north(0, 500, 120_000))).toEqual({ outcome: "stale_fix" });
    expect(decideGpsCheckIn(STOP, north(0, 5, -10_000))).toEqual({ outcome: "stale_fix" });
    expect(decideGpsCheckIn(STOP, north(0, 5, -1_000)).outcome).toBe("checked_in"); // clock jitter
  });

  it("uses the stop's own radius", () => {
    const wide = { ...STOP, checkInRadiusM: 150 };
    expect(decideGpsCheckIn(STOP, north(140, 5)).outcome).toBe("too_far");
    expect(decideGpsCheckIn(wide, north(140, 5)).outcome).toBe("checked_in");
  });
});
