import { describe, expect, it } from "vitest";
import { saude } from "@/content/porto/saude";
import type { ExperienceContent } from "@/features/engine/types";
import { fromRows, toRows } from "./content-rows";

/** Order-insensitive comparison (the database doesn't promise row order). */
function canonical(c: ExperienceContent) {
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...c,
    challenges: byId(c.challenges),
    hints: byId(c.hints),
    answerKeys: [...c.answerKeys].sort((a, b) => a.challengeId.localeCompare(b.challengeId)),
  };
}

describe("content rows", () => {
  it("round-trips Saúde! through rows unchanged", () => {
    expect(canonical(fromRows(toRows(saude)))).toEqual(canonical(saude));
  });

  it("reads Postgres times (HH:MM:SS) back as HH:MM", () => {
    const rows = toRows(saude);
    rows.stops = rows.stops.map((s) => ({ ...s, opens_at: "18:00:00", closes_at: "02:00:00" }));
    const content = fromRows(rows);
    expect(content.stops[0]).toMatchObject({ opensAt: "18:00", closesAt: "02:00" });
  });

  it("sorts stops and options by position whatever order the rows come in", () => {
    const rows = toRows(saude);
    rows.stops.reverse();
    rows.options.reverse();
    const content = fromRows(rows);
    expect(content.stops.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
    for (const c of content.challenges) {
      if (c.type === "multiple_choice") expect(c.options.map((o) => o.position)).toEqual([1, 2, 3, 4]);
    }
  });

  it("rejects malformed rows instead of guessing", () => {
    const rows = toRows(saude) as unknown as { stops: { lat: unknown }[] };
    rows.stops[0]!.lat = "41.14";
    expect(() => fromRows(rows)).toThrow();
  });
});
