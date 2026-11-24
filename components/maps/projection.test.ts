import { describe, expect, it } from "vitest";
import { fitPoints } from "./projection";

const box = { width: 320, height: 180, padding: 24 };

describe("fitPoints", () => {
  it("centres a single point", () => {
    expect(fitPoints([{ lat: 41.14, lng: -8.61 }], box)).toEqual([{ x: 160, y: 90 }]);
  });

  it("keeps every point inside the padded box", () => {
    const pts = fitPoints(
      [
        { lat: 41.1407, lng: -8.6131 },
        { lat: 41.1428, lng: -8.611 },
        { lat: 41.1484, lng: -8.6109 },
        { lat: 41.1468, lng: -8.6142 },
      ],
      box,
    );
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(box.padding - 0.001);
      expect(p.x).toBeLessThanOrEqual(box.width - box.padding + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(box.padding - 0.001);
      expect(p.y).toBeLessThanOrEqual(box.height - box.padding + 0.001);
    }
  });

  it("puts north up and east right", () => {
    const [south, north] = fitPoints([{ lat: 41.14, lng: -8.61 }, { lat: 41.15, lng: -8.61 }], box);
    expect(north!.y).toBeLessThan(south!.y);
    const [west, east] = fitPoints([{ lat: 41.14, lng: -8.62 }, { lat: 41.14, lng: -8.6 }], box);
    expect(east!.x).toBeGreaterThan(west!.x);
  });

  it("returns nothing for no points", () => {
    expect(fitPoints([], box)).toEqual([]);
  });
});
