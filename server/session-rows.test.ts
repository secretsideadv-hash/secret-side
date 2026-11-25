import { describe, expect, it } from "vitest";
import { saude } from "@/content/porto/saude";
import { checkIn, revealHint, startSession } from "@/features/engine/session";
import { sessionFromRow, sessionToRows } from "./session-rows";

const OWNER = "11111111-1111-4111-8111-111111111111";

function storedRow(rows: ReturnType<typeof sessionToRows>, version: number) {
  return { ...rows.session, version, session_stops: rows.stops };
}

describe("session rows", () => {
  const now = new Date("2026-11-25T20:00:00.000Z");
  let session = startSession({ id: "22222222-2222-4222-8222-222222222222", content: saude, now, ownerId: OWNER });
  session = checkIn(session, saude, { stopId: saude.stops[0]!.id, method: "manual", now });
  session = revealHint(session, saude, { stopId: saude.stops[0]!.id, level: 1, now });

  it("round-trips a session through rows unchanged, with its version", () => {
    const back = sessionFromRow(storedRow(sessionToRows(session, OWNER), 7));
    expect(back).toEqual({ session, version: 7 });
  });

  it("writes the verified owner, not whatever the session object says", () => {
    const rows = sessionToRows({ ...session, ownerId: "someone-else" }, OWNER);
    expect(rows.session.owner_id).toBe(OWNER);
  });

  it("normalises Postgres timestamps to the engine's ISO strings", () => {
    const rows = sessionToRows(session, OWNER);
    const row = storedRow(rows, 0);
    row.last_activity_at = "2026-11-25 20:00:00+00";
    expect(sessionFromRow(row).session.lastActivityAt).toBe("2026-11-25T20:00:00.000Z");
  });

  it("rejects rows that don't match the schema", () => {
    const row = storedRow(sessionToRows(session, OWNER), 0) as Record<string, unknown>;
    row.status = "paused";
    expect(() => sessionFromRow(row)).toThrow();
  });
});
