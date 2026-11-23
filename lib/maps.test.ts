import { describe, expect, it } from "vitest";
import { googleMapsDirectionsUrl } from "./maps";

describe("googleMapsDirectionsUrl", () => {
  it("builds a walking-directions link", () => {
    const url = new URL(googleMapsDirectionsUrl(41.1407, -8.6131));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("41.1407,-8.6131");
    expect(url.searchParams.get("travelmode")).toBe("walking");
  });
});
