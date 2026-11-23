import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, formatPrice } from "./format";

describe("format", () => {
  it.each([
    [150, "2h 30m"],
    [120, "2h"],
    [45, "45m"],
  ])("duration %i → %s", (m, s) => expect(formatDuration(m)).toBe(s));

  it.each([
    [1900, "1.9 km"],
    [2000, "2 km"],
    [800, "800 m"],
  ])("distance %i → %s", (m, s) => expect(formatDistance(m)).toBe(s));

  it.each([
    [1500, "€15"],
    [1250, "€12.50"],
    [799, "€7.99"],
    [0, "Free"],
  ])("price %i → %s", (c, s) => expect(formatPrice(c, "EUR")).toBe(s));
});
