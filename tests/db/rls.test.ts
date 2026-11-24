/**
 * Row Level Security on the dev project. With the PUBLISHABLE key, a visitor or
 * a signed-in guest can't read answers, hints, stops (so no locked stops) or
 * another guest's sessions, and can't write anything. Fixtures are created with
 * the secret key and removed afterwards.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, expectDenied, expectNoRows, guestClient } from "./clients";

const tag = randomUUID().slice(0, 8);
const SECRET_ANSWER = `SENTINEL_ANSWER_${tag}`;
const SECRET_HINT = `SENTINEL_HINT_${tag}`;
const LOCKED_TITLE = `SENTINEL_LOCKED_STOP_${tag}`;

const id = {
  draft: randomUUID(),
  published: randomUUID(),
  stop1: randomUUID(),
  stop2: randomUUID(),
  mc: randomUUID(),
  text: randomUUID(),
  optA: randomUUID(),
  optB: randomUUID(),
  hint1: randomUUID(),
  hint2: randomUUID(),
  session: randomUUID(),
};

const experience = (expId: string, status: "draft" | "published") => ({
  id: expId,
  slug: `zz-rls-${status}-${tag}`,
  city_slug: "porto",
  kind: "mystery_walk",
  title: `RLS fixture (${status})`,
  tagline: "Test fixture",
  description: "Created and deleted by tests/db/rls.test.ts",
  duration_minutes: 60,
  distance_meters: 1000,
  walking_difficulty: "easy",
  status,
});

const stop = (stopId: string, position: number, title: string) => ({
  id: stopId,
  experience_id: id.published,
  position,
  title,
  teaser: "teaser",
  story: "story",
  venue_name: `Venue ${position}`,
  lat: 41.141,
  lng: -8.611,
});

let admin: SupabaseClient;
let anon: SupabaseClient;
let guestA: { client: SupabaseClient; userId: string };
let guestB: { client: SupabaseClient; userId: string };

async function seed(table: string, rows: object | object[]) {
  const { error } = await admin.from(table).insert(rows, { defaultToNull: false });
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

beforeAll(async () => {
  admin = adminClient();
  anon = anonClient();
  [guestA, guestB] = await Promise.all([guestClient(), guestClient()]);

  await seed("experiences", [experience(id.draft, "draft"), experience(id.published, "published")]);
  await seed("stops", [stop(id.stop1, 1, "Unlocked stop"), stop(id.stop2, 2, LOCKED_TITLE)]);
  await seed("challenges", [
    { id: id.mc, stop_id: id.stop1, type: "multiple_choice", prompt: "Which one?" },
    { id: id.text, stop_id: id.stop2, type: "text", prompt: "What word?" },
  ]);
  await seed("challenge_options", [
    { id: id.optA, challenge_id: id.mc, label: "A", position: 1 },
    { id: id.optB, challenge_id: id.mc, label: "B", position: 2 },
  ]);
  await seed("challenge_answers", [
    { challenge_id: id.mc, type: "multiple_choice", correct_option_id: id.optB },
    { challenge_id: id.text, type: "text", accepted_answers: [SECRET_ANSWER], allow_fuzzy: false },
  ]);
  await seed("hints", [
    { id: id.hint1, challenge_id: id.mc, level: 1, text: SECRET_HINT },
    { id: id.hint2, challenge_id: id.mc, level: 2, text: `${SECRET_HINT}_2` },
  ]);
  const now = new Date().toISOString();
  await seed("sessions", {
    id: id.session,
    experience_id: id.published,
    owner_id: guestA.userId,
    status: "in_progress",
    current_position: 1,
    started_at: now,
    last_activity_at: now,
  });
  await seed("session_stops", [
    { session_id: id.session, stop_id: id.stop1, experience_id: id.published, status: "unlocked" },
    { session_id: id.session, stop_id: id.stop2, experience_id: id.published, status: "locked" },
  ]);
});

afterAll(async () => {
  if (!admin) return;
  await admin.from("sessions").delete().eq("id", id.session);
  await admin.from("experiences").delete().in("id", [id.draft, id.published]);
  for (const guest of [guestA, guestB]) if (guest) await admin.auth.admin.deleteUser(guest.userId);
});

const SERVER_ONLY_TABLES = ["stops", "challenges", "challenge_options", "challenge_answers", "hints"] as const;

describe.each([
  ["a visitor (publishable key, not signed in)", () => anon],
  ["a signed-in guest", () => guestA.client],
])("%s", (_who, client) => {
  it.each(SERVER_ONLY_TABLES)("cannot read %s at all", async (table) => {
    expectDenied(await client().from(table).select("*"), `select ${table}`);
  });

  it("cannot read answers, hints or a locked stop even by id", async () => {
    expectDenied(await client().from("challenge_answers").select("*").eq("challenge_id", id.text), "answer by id");
    expectDenied(await client().from("hints").select("text").eq("id", id.hint1), "hint by id");
    expectDenied(await client().from("stops").select("title").eq("id", id.stop2), "locked stop by id");
  });

  it("sees published experiences but not drafts", async () => {
    const { data, error } = await client()
      .from("experiences")
      .select("id, status")
      .in("id", [id.draft, id.published]);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: id.published, status: "published" }]);
  });
});

describe("sessions", () => {
  it("a visitor who isn't signed in can't read sessions or progress", async () => {
    expectDenied(await anon.from("sessions").select("*"), "anon sessions");
    expectDenied(await anon.from("session_stops").select("*"), "anon session_stops");
  });

  it("another guest can't read someone else's session or progress", async () => {
    expectNoRows(await guestB.client.from("sessions").select("*").eq("id", id.session), "B reads A's session");
    expectNoRows(
      await guestB.client.from("session_stops").select("*").eq("session_id", id.session),
      "B reads A's progress",
    );
  });

  it("the owner reads their own session, but never the locked stop's row", async () => {
    const own = await guestA.client.from("sessions").select("id, owner_id").eq("id", id.session);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ id: id.session, owner_id: guestA.userId }]);

    const progress = await guestA.client
      .from("session_stops")
      .select("stop_id, status")
      .eq("session_id", id.session);
    expect(progress.error).toBeNull();
    expect(progress.data).toEqual([{ stop_id: id.stop1, status: "unlocked" }]);
    expect(JSON.stringify(progress.data)).not.toContain(id.stop2);
  });
});

describe("guests can't write anything", () => {
  it("can't create, change or delete sessions or progress", async () => {
    const c = guestA.client;
    const now = new Date().toISOString();
    expectDenied(
      await c.from("sessions").insert({
        id: randomUUID(),
        experience_id: id.published,
        owner_id: guestA.userId,
        status: "in_progress",
        current_position: 1,
        last_activity_at: now,
      }),
      "insert session",
    );
    expectDenied(await c.from("sessions").update({ score: 9999 }).eq("id", id.session), "update own score");
    expectDenied(await c.from("sessions").delete().eq("id", id.session), "delete own session");
    expectDenied(
      await c
        .from("session_stops")
        .update({ status: "solved", resolution: "answered" })
        .eq("session_id", id.session),
      "update own progress",
    );
    expectDenied(
      await c
        .from("session_stops")
        .insert({ session_id: id.session, stop_id: id.stop2, experience_id: id.published, status: "unlocked" }),
      "insert progress",
    );
  });

  it("can't change content", async () => {
    const c = guestA.client;
    expectDenied(await c.from("experiences").update({ price_cents: 0 }).eq("id", id.published), "update experience");
    expectDenied(await c.from("experiences").delete().eq("id", id.published), "delete experience");
    expectDenied(
      await c.from("challenge_answers").update({ accepted_answers: ["x"] }).eq("challenge_id", id.text),
      "update answer",
    );
    expectDenied(
      await c.from("hints").insert({ id: randomUUID(), challenge_id: id.text, level: 1, text: "x" }),
      "insert hint",
    );
  });

  it("left the seeded secrets untouched", async () => {
    const answers = await admin.from("challenge_answers").select("accepted_answers").eq("challenge_id", id.text);
    expect(answers.data).toEqual([{ accepted_answers: [SECRET_ANSWER] }]);
    const session = await admin.from("sessions").select("score").eq("id", id.session);
    expect(session.data).toEqual([{ score: 0 }]);
  });
});
