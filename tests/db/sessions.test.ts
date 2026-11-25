/**
 * The Supabase session store against the dev project (needs Saúde! imported:
 * `npm run content:import -- dev`). Covers one active session per guest per
 * experience, the optimistic version check, owner scoping and the abandon sweep.
 */
import { randomUUID } from "node:crypto";
import type { Client as PgClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saude } from "@/content/porto/saude";
import { checkIn, checkInWithGps, endEarly, startSession } from "@/features/engine/session";
import { createSession, loadOwnSession, loadUnfinishedSession, saveSession } from "@/server/session-store";
import { adminClient, anonClient, devPostgres, expectDenied, guestClient } from "./clients";

let pg: PgClient;
let owner: string;
let stranger: string;
const admin = adminClient();

const newSession = (ownerId: string) =>
  startSession({ id: randomUUID(), content: saude, now: new Date(), ownerId });

beforeAll(async () => {
  pg = await devPostgres();
  [owner, stranger] = (await Promise.all([guestClient(), guestClient()])).map((g) => g.userId);
});

afterAll(async () => {
  // Deleting the users cascades to their sessions and session_stops.
  for (const id of [owner, stranger]) if (id) await admin.auth.admin.deleteUser(id);
  await pg?.end();
});

describe("session store (dev)", () => {
  let sessionId: string;

  it("creates a session with all its stops at version 0", async () => {
    sessionId = await createSession(newSession(owner), owner);
    const stored = await loadOwnSession(sessionId, owner);
    expect(stored?.version).toBe(0);
    expect(stored?.session.stops).toHaveLength(saude.stops.length);
    expect(stored?.session.stops.filter((s) => s.status === "unlocked")).toHaveLength(1);
  });

  it("keeps one unfinished session per guest per experience, even when two starts race", async () => {
    const [a, b] = await Promise.all([
      createSession(newSession(owner), owner),
      createSession(newSession(owner), owner),
    ]);
    expect([a, b]).toEqual([sessionId, sessionId]);
    expect((await loadUnfinishedSession(owner, saude.experience.id))?.session.id).toBe(sessionId);
  });

  it("never returns a session to someone who doesn't own it", async () => {
    expect(await loadOwnSession(sessionId, stranger)).toBeNull();
    expect(await loadUnfinishedSession(stranger)).toBeNull();
  });

  it("writes only at the expected version, so an old request can't land twice", async () => {
    const stored = (await loadOwnSession(sessionId, owner))!;
    const arrived = checkIn(stored.session, saude, { stopId: saude.stops[0]!.id, method: "manual", now: new Date() });

    expect(await saveSession(arrived, owner, 0)).toBe(1);
    // The same write again (a replay) is rejected and changes nothing.
    expect(await saveSession(arrived, owner, 0)).toBeNull();
    expect(await saveSession({ ...arrived, score: 999 }, owner, 0)).toBeNull();
    // Someone else's id can't write either, even with the right version.
    expect(await saveSession({ ...arrived, score: 999 }, stranger, 1)).toBeNull();

    const after = (await loadOwnSession(sessionId, owner))!;
    expect(after.version).toBe(1);
    expect(after.session.score).toBe(0);
    expect(after.session.stops.find((s) => s.stopId === saude.stops[0]!.id)?.status).toBe("arrived");
  });

  it("saves abandoned sessions in the hourly sweep and makes older requests stale", async () => {
    const idle = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
    await pg.query("update public.sessions set last_activity_at = $1 where id = $2", [idle, sessionId]);
    const { rows } = await pg.query<{ n: number }>("select private.abandon_idle_sessions() as n");
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1);

    const stored = (await loadOwnSession(sessionId, owner))!;
    expect(stored.session.status).toBe("abandoned");
    expect(stored.version).toBe(2);
    expect(await saveSession(stored.session, owner, 1)).toBeNull();

    const job = await pg.query("select schedule, command from cron.job where jobname = 'abandon-idle-sessions'");
    expect(job.rows).toEqual([{ schedule: "17 * * * *", command: "select private.abandon_idle_sessions()" }]);
  });

  it("lets a guest start the same adventure again once the last one is completed", async () => {
    const now = new Date().toISOString();
    await admin.from("sessions").update({ status: "completed", completed_at: now, end_reason: "finished" }).eq("id", sessionId);
    const again = await createSession(newSession(owner), owner);
    expect(again).not.toBe(sessionId);
  });

  it("guests can't call the session functions with the publishable key", async () => {
    const anon = anonClient();
    const { client: guest } = await guestClient().then(async (g) => {
      await admin.auth.admin.deleteUser(g.userId).catch(() => {});
      return g;
    });
    for (const c of [anon, guest]) {
      expectDenied(await c.rpc("create_session", { session: {}, stops: [] }), "create_session");
      expectDenied(await c.rpc("save_session", { session: {}, stops: [], expected_version: 0 }), "save_session");
    }
  });
});

describe("GPS check-in details and end reason (dev)", () => {
  it("round-trip through the store, and the emergency end is saved with the version check", async () => {
    const id = await createSession(newSession(stranger), stranger);
    const stored = (await loadOwnSession(id, stranger))!;
    const stop1 = saude.stops.find((s) => s.position === 1)!;
    const fix = { lat: stop1.lat + 20 / 111_195, lng: stop1.lng, accuracyM: 9.2, ageMs: 1_500 };
    const gps = checkInWithGps(stored.session, saude, { stopId: stop1.id, fix, now: new Date() });
    expect(gps.result.outcome).toBe("checked_in");
    expect(await saveSession(gps.session, stranger, stored.version)).toBe(stored.version + 1);

    const arrived = (await loadOwnSession(id, stranger))!;
    expect(arrived.session.stops.find((s) => s.stopId === stop1.id)).toMatchObject({
      checkInMethod: "gps",
      checkInDistanceM: 20,
      checkInAccuracyM: 10,
    });

    const ended = endEarly(arrived.session, saude, { now: new Date() });
    expect(await saveSession(ended, stranger, arrived.version - 1)).toBeNull(); // stale version
    expect(await saveSession(ended, stranger, arrived.version)).toBe(arrived.version + 1);
    const after = (await loadOwnSession(id, stranger))!;
    expect(after.session).toMatchObject({ status: "completed", endReason: "emergency" });
    expect(after.session.stops.every((s) => s.status === "solved" || s.status === "skipped")).toBe(true);
  });

  it("the database refuses inconsistent rows even from the server", async () => {
    const id = await createSession(newSession(stranger), stranger);
    const stop1 = saude.stops.find((s) => s.position === 1)!;
    const gpsWithoutDistance = await admin
      .from("session_stops")
      .update({ check_in_method: "gps", status: "arrived" })
      .eq("session_id", id)
      .eq("stop_id", stop1.id);
    expect(gpsWithoutDistance.error?.code).toBe("23514"); // check_violation
    const completedWithoutReason = await admin
      .from("sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);
    expect(completedWithoutReason.error?.code).toBe("23514");
  });
});
