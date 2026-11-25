/**
 * GPS check-in (GAME_RULES §5) and ending early from the Emergency view (§11),
 * at the engine level, plus what the client may see before and after.
 */
import { describe, expect, it } from "vitest";
import { buildSentinelContent, correctAnswerFor, stopId, STOP_COUNT } from "./__fixtures__/sentinel-content";
import { EngineError } from "./errors";
import {
  checkIn,
  checkInWithGps,
  endEarly,
  revealHint,
  skipStop,
  startSession,
  submitAnswer,
} from "./session";
import type { GpsFix, Session } from "./types";
import { toVisibleState } from "./visible-state";

const content = buildSentinelContent();
const T0 = new Date("2026-11-25T21:00:00.000Z");
const METRES_PER_DEGREE_LAT = (Math.PI / 180) * 6_371_008.8;
const stop1 = content.stops.find((s) => s.position === 1)!;

/** A fix `metres` north of stop 1. */
const near1 = (metres: number, accuracyM = 10, ageMs = 2_000): GpsFix => ({
  lat: stop1.lat + metres / METRES_PER_DEGREE_LAT,
  lng: stop1.lng,
  accuracyM,
  ageMs,
});

const start = () => startSession({ id: "session-gps", content, now: T0 });
const progressOf = (s: Session, i: number) => s.stops.find((p) => p.stopId === stopId(i))!;

describe("checkInWithGps", () => {
  it("checks in within the radius and records method, distance and accuracy (never coordinates)", () => {
    const { session, result } = checkInWithGps(start(), content, { stopId: stopId(1), fix: near1(30, 12.4), now: T0 });
    expect(result).toEqual({ outcome: "checked_in", distanceM: 30, accuracyM: 13 });
    const p = progressOf(session, 1);
    expect(p).toMatchObject({ status: "arrived", checkInMethod: "gps", checkInDistanceM: 30, checkInAccuracyM: 13 });
    expect(JSON.stringify(session)).not.toContain(String(near1(30).lat).slice(0, 8));
  });

  it("leaves the session untouched when the fix is too far, inaccurate or stale", () => {
    const s = start();
    for (const [fix, outcome] of [
      [near1(400), "too_far"],
      [near1(0, 250), "inaccurate"],
      [near1(0, 5, 90_000), "stale_fix"],
    ] as const) {
      const r = checkInWithGps(s, content, { stopId: stopId(1), fix, now: T0 });
      expect(r.result.outcome).toBe(outcome);
      expect(r.session).toBe(s);
    }
  });

  it("is idempotent once arrived, and manual check-in records no GPS details", () => {
    const first = checkInWithGps(start(), content, { stopId: stopId(1), fix: near1(20), now: T0 });
    const again = checkInWithGps(first.session, content, { stopId: stopId(1), fix: near1(500), now: T0 });
    expect(again.session).toBe(first.session);
    expect(again.result.outcome).toBe("checked_in");

    const manual = checkIn(start(), content, { stopId: stopId(1), method: "manual", now: T0 });
    expect(progressOf(manual, 1)).toMatchObject({ checkInMethod: "manual", checkInDistanceM: null, checkInAccuracyM: null });
  });

  it("only works on the current stop", () => {
    expect(() => checkInWithGps(start(), content, { stopId: stopId(2), fix: near1(0), now: T0 })).toThrow(EngineError);
  });
});

describe("endEarly (Emergency: show all remaining stops)", () => {
  // Stop 1 solved with a hint (85 points), now at stop 2 after checking in.
  function midAdventure(): Session {
    let s = checkIn(start(), content, { stopId: stopId(1), method: "manual", now: T0 });
    s = revealHint(s, content, { stopId: stopId(1), level: 1, now: T0 });
    s = submitAnswer(s, content, { stopId: stopId(1), answer: correctAnswerFor(1), now: T0 }).session;
    return checkIn(s, content, { stopId: stopId(2), method: "manual", now: T0 });
  }

  it("completes the session with endReason emergency, keeps the score and skips the rest without penalty", () => {
    const before = midAdventure();
    const ended = endEarly(before, content, { now: T0 });
    expect(ended).toMatchObject({ status: "completed", endReason: "emergency", score: before.score, completedAt: T0.toISOString() });
    expect(progressOf(ended, 1)).toEqual(progressOf(before, 1)); // solved stop unchanged
    for (let i = 2; i <= STOP_COUNT; i++) {
      expect(progressOf(ended, i)).toMatchObject({ status: "skipped", resolution: "skipped", completedAt: T0.toISOString() });
    }
  });

  it("is idempotent, refuses a session that already finished normally, and blocks further play", () => {
    const ended = endEarly(midAdventure(), content, { now: T0 });
    expect(endEarly(ended, content, { now: T0 })).toBe(ended);
    expect(() => skipStop(ended, content, { stopId: stopId(2), now: T0 })).toThrow(EngineError);

    let finished = start();
    for (let i = 1; i <= STOP_COUNT; i++) finished = skipStop(finished, content, { stopId: stopId(i), now: T0 });
    expect(finished).toMatchObject({ status: "completed", endReason: "finished" });
    expect(() => endEarly(finished, content, { now: T0 })).toThrow(EngineError);
  });

  it("locked stops stay hidden until the session has ended, then names and places are shown, never stories or answers", () => {
    const before = toVisibleState(midAdventure(), content, T0);
    const hidden = JSON.stringify(before);
    for (let i = 3; i <= STOP_COUNT; i++) {
      expect(hidden).not.toContain(`TITLE_${i}_ZQ`);
      expect(hidden).not.toContain(stopId(i));
    }

    const after = toVisibleState(endEarly(midAdventure(), content, { now: T0 }), content, T0);
    expect(after.session).toMatchObject({ status: "completed", endReason: "emergency" });
    expect(after.current).toBeNull();
    expect(after.completedStops.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
    for (const s of after.completedStops.slice(1)) {
      expect(s).toMatchObject({ resolution: "skipped", answer: null, explanation: null });
      expect(s.title).toMatch(/^TITLE_\d_ZQ$/);
    }
    const shown = JSON.stringify(after);
    expect(shown).not.toMatch(/STORY_[2-5]_ZQ|HINT|Answerword|correctOptionId|acceptedAnswers/);
  });
});
