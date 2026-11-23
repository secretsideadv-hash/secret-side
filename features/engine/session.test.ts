import { describe, expect, it } from "vitest";
import {
  buildSentinelContent,
  correctAnswerFor,
  optionId,
  stopId,
  STOP_COUNT,
  wrongAnswerFor,
} from "./__fixtures__/sentinel-content";
import { EngineError } from "./errors";
import { RULES } from "./rules";
import { stopScore } from "./scoring";
import {
  applyInactivity,
  checkIn,
  revealAnswer,
  revealHint,
  skipStop,
  startSession,
  submitAnswer,
  unlockNextStop,
} from "./session";
import type { Session } from "./types";

const content = buildSentinelContent();
const T0 = new Date("2026-11-23T20:00:00.000Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

const start = () => startSession({ id: "session-1", content, now: T0 });
const arriveAt1 = () => checkIn(start(), content, { stopId: stopId(1), method: "manual", now: T0 });
const progressOf = (s: Session, i: number) => s.stops.find((p) => p.stopId === stopId(i))!;

function expectEngineError(fn: () => unknown, code: EngineError["code"]) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`Expected EngineError ${code}`);
}

describe("startSession", () => {
  it("unlocks stop 1 and locks the rest", () => {
    const s = start();
    expect(s.status).toBe("in_progress");
    expect(s.currentPosition).toBe(1);
    expect(s.score).toBe(0);
    expect(s.stops.map((p) => p.status)).toEqual(["unlocked", "locked", "locked", "locked", "locked"]);
  });
});

describe("checkIn", () => {
  it("moves the current stop to arrived and records the method", () => {
    const p = progressOf(arriveAt1(), 1);
    expect(p.status).toBe("arrived");
    expect(p.checkInMethod).toBe("manual");
    expect(p.arrivedAt).toBe(T0.toISOString());
  });

  it("is idempotent", () => {
    const s = arriveAt1();
    expect(checkIn(s, content, { stopId: stopId(1), method: "gps", now: later(1) })).toBe(s);
  });

  it("refuses a stop that isn't current (locked stops can't be reached)", () => {
    expectEngineError(
      () => checkIn(start(), content, { stopId: stopId(2), method: "manual", now: T0 }),
      "stop_not_current",
    );
  });
});

describe("submitAnswer", () => {
  it("requires arrival first", () => {
    expectEngineError(
      () => submitAnswer(start(), content, { stopId: stopId(1), answer: correctAnswerFor(1), now: T0 }),
      "not_arrived",
    );
  });

  it("a correct answer solves the stop, scores 100 and unlocks the next stop", () => {
    const { session, result } = submitAnswer(arriveAt1(), content, {
      stopId: stopId(1),
      answer: correctAnswerFor(1),
      now: T0,
    });
    expect(result).toEqual({ outcome: "correct" });
    expect(progressOf(session, 1)).toMatchObject({ status: "solved", resolution: "answered" });
    expect(progressOf(session, 2).status).toBe("unlocked");
    expect(session.currentPosition).toBe(2);
    expect(session.score).toBe(100);
  });

  it("a wrong answer counts an attempt and keeps the stop open", () => {
    const { session, result } = submitAnswer(arriveAt1(), content, {
      stopId: stopId(1),
      answer: wrongAnswerFor(1),
      now: T0,
    });
    expect(result).toEqual({ outcome: "wrong", cooldownUntil: null });
    expect(progressOf(session, 1)).toMatchObject({ status: "arrived", wrongAttempts: 1 });
    expect(session.currentPosition).toBe(1);
  });

  it("rejects malformed answers without counting an attempt", () => {
    const s = arriveAt1();
    const bad = [
      { type: "multiple_choice" as const, optionId: "not-an-option" },
      { type: "multiple_choice" as const, optionId: optionId(3, 3) }, // another stop's option
      { type: "text" as const, text: "wrong type" },
    ];
    for (const answer of bad) {
      expectEngineError(
        () => submitAnswer(s, content, { stopId: stopId(1), answer, now: T0 }),
        "invalid_answer",
      );
    }
    expect(progressOf(s, 1).wrongAttempts).toBe(0);
  });

  it("rejects an empty text answer", () => {
    let s = arriveAt1();
    s = submitAnswer(s, content, { stopId: stopId(1), answer: correctAnswerFor(1), now: T0 }).session;
    s = checkIn(s, content, { stopId: stopId(2), method: "manual", now: T0 });
    expectEngineError(
      () => submitAnswer(s, content, { stopId: stopId(2), answer: { type: "text", text: "  " }, now: T0 }),
      "invalid_answer",
    );
  });

  it("rejects a stale double-submit on an already solved stop", () => {
    const { session } = submitAnswer(arriveAt1(), content, {
      stopId: stopId(1),
      answer: correctAnswerFor(1),
      now: T0,
    });
    expectEngineError(
      () => submitAnswer(session, content, { stopId: stopId(1), answer: correctAnswerFor(1), now: T0 }),
      "stop_not_current",
    );
  });

  it("does not mutate the input session", () => {
    const s = arriveAt1();
    const before = JSON.stringify(s);
    submitAnswer(s, content, { stopId: stopId(1), answer: wrongAnswerFor(1), now: T0 });
    submitAnswer(s, content, { stopId: stopId(1), answer: correctAnswerFor(1), now: T0 });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("cooldown (GAME_RULES §6)", () => {
  function wrongTimes(n: number, s = arriveAt1()) {
    for (let k = 0; k < n; k++) {
      s = submitAnswer(s, content, { stopId: stopId(1), answer: wrongAnswerFor(1), now: T0 }).session;
    }
    return s;
  }

  it("no cooldown for the first 4 wrong answers in a row", () => {
    expect(progressOf(wrongTimes(4), 1).cooldownUntil).toBeNull();
  });

  it("starts a 3-second cooldown on the 5th wrong answer in a row", () => {
    const p = progressOf(wrongTimes(5), 1);
    expect(p.cooldownUntil).toBe(later(RULES.cooldownMs).toISOString());
  });

  it("blocks answers during the cooldown, even the right one, without counting them", () => {
    const s = wrongTimes(5);
    const { session, result } = submitAnswer(s, content, {
      stopId: stopId(1),
      answer: correctAnswerFor(1),
      now: later(1_000),
    });
    expect(result.outcome).toBe("cooldown");
    expect(session).toBe(s);
  });

  it("accepts answers again once the cooldown is over", () => {
    const { result } = submitAnswer(wrongTimes(5), content, {
      stopId: stopId(1),
      answer: correctAnswerFor(1),
      now: later(RULES.cooldownMs),
    });
    expect(result.outcome).toBe("correct");
  });
});

describe("hints (GAME_RULES §7)", () => {
  it("can't be taken before arrival", () => {
    expectEngineError(
      () => revealHint(start(), content, { stopId: stopId(1), level: 1, now: T0 }),
      "not_arrived",
    );
  });

  it("hint 1 is always available after arrival", () => {
    const s = revealHint(arriveAt1(), content, { stopId: stopId(1), level: 1, now: T0 });
    expect(progressOf(s, 1).revealedHintLevels).toEqual([1]);
  });

  it("hint 2 is locked until hint 1 or 2 wrong attempts", () => {
    expectEngineError(
      () => revealHint(arriveAt1(), content, { stopId: stopId(1), level: 2, now: T0 }),
      "hint_unavailable",
    );
    // still locked after one wrong attempt
    const oneWrong = submitAnswer(arriveAt1(), content, {
      stopId: stopId(1),
      answer: wrongAnswerFor(1),
      now: T0,
    }).session;
    expectEngineError(
      () => revealHint(oneWrong, content, { stopId: stopId(1), level: 2, now: T0 }),
      "hint_unavailable",
    );
  });

  it("hint 2 unlocks after hint 1", () => {
    let s = revealHint(arriveAt1(), content, { stopId: stopId(1), level: 1, now: T0 });
    s = revealHint(s, content, { stopId: stopId(1), level: 2, now: T0 });
    expect(progressOf(s, 1).revealedHintLevels).toEqual([1, 2]);
  });

  it("hint 2 unlocks directly after 2 wrong attempts", () => {
    let s = arriveAt1();
    for (let k = 0; k < 2; k++) {
      s = submitAnswer(s, content, { stopId: stopId(1), answer: wrongAnswerFor(1), now: T0 }).session;
    }
    s = revealHint(s, content, { stopId: stopId(1), level: 2, now: T0 });
    expect(progressOf(s, 1).revealedHintLevels).toEqual([2]);
  });

  it("revealing the same hint twice is a no-op (no double penalty)", () => {
    const s = revealHint(arriveAt1(), content, { stopId: stopId(1), level: 1, now: T0 });
    expect(revealHint(s, content, { stopId: stopId(1), level: 1, now: later(5) })).toBe(s);
  });

  it("each hint costs 15 points", () => {
    let s = revealHint(arriveAt1(), content, { stopId: stopId(1), level: 1, now: T0 });
    s = submitAnswer(s, content, { stopId: stopId(1), answer: correctAnswerFor(1), now: T0 }).session;
    expect(s.score).toBe(85);
  });
});

describe("reveal answer (GAME_RULES §7)", () => {
  it("is unavailable before hint 2", () => {
    expectEngineError(() => revealAnswer(arriveAt1(), content, { stopId: stopId(1), now: T0 }), "reveal_unavailable");
    const afterHint1 = revealHint(arriveAt1(), content, { stopId: stopId(1), level: 1, now: T0 });
    expectEngineError(() => revealAnswer(afterHint1, content, { stopId: stopId(1), now: T0 }), "reveal_unavailable");
  });

  it("after hint 2 it solves the stop as 'revealed' and unlocks the next", () => {
    let s = revealHint(arriveAt1(), content, { stopId: stopId(1), level: 1, now: T0 });
    s = revealHint(s, content, { stopId: stopId(1), level: 2, now: T0 });
    s = revealAnswer(s, content, { stopId: stopId(1), now: T0 });
    expect(progressOf(s, 1)).toMatchObject({ status: "solved", resolution: "revealed" });
    expect(progressOf(s, 2).status).toBe("unlocked");
    expect(s.score).toBe(100 - 2 * 15 - 50);
  });
});

describe("skipping (GAME_RULES §3, §7)", () => {
  it("is allowed before arrival and unlocks the next stop", () => {
    const s = skipStop(start(), content, { stopId: stopId(1), now: T0 });
    expect(progressOf(s, 1)).toMatchObject({ status: "skipped", resolution: "skipped" });
    expect(progressOf(s, 2).status).toBe("unlocked");
    expect(s.currentPosition).toBe(2);
    expect(s.score).toBe(50);
  });

  it("is allowed after arrival, with no hints needed", () => {
    const s = skipStop(arriveAt1(), content, { stopId: stopId(1), now: T0 });
    expect(progressOf(s, 1).status).toBe("skipped");
  });

  it("subtracts hint penalties too", () => {
    let s = revealHint(arriveAt1(), content, { stopId: stopId(1), level: 1, now: T0 });
    s = skipStop(s, content, { stopId: stopId(1), now: T0 });
    expect(s.score).toBe(100 - 15 - 50);
  });

  it("can't skip a locked stop or one that's already done", () => {
    expectEngineError(() => skipStop(start(), content, { stopId: stopId(3), now: T0 }), "stop_not_current");
    const s = skipStop(start(), content, { stopId: stopId(1), now: T0 });
    expectEngineError(() => skipStop(s, content, { stopId: stopId(1), now: T0 }), "stop_not_current");
  });

  it("skipping every stop completes the session", () => {
    let s = start();
    for (let i = 1; i <= STOP_COUNT; i++) s = skipStop(s, content, { stopId: stopId(i), now: later(i) });
    expect(s.status).toBe("completed");
    expect(s.completedAt).toBe(later(STOP_COUNT).toISOString());
    expect(s.score).toBe(STOP_COUNT * 50);
  });
});

describe("unlockNextStop / completion", () => {
  it("refuses to unlock while the current stop is still open", () => {
    expectEngineError(() => unlockNextStop(arriveAt1(), content, T0), "stop_not_current");
  });

  it("completing the final stop completes the session; further actions are refused", () => {
    let s = start();
    for (let i = 1; i <= STOP_COUNT; i++) {
      s = checkIn(s, content, { stopId: stopId(i), method: "manual", now: T0 });
      s = submitAnswer(s, content, { stopId: stopId(i), answer: correctAnswerFor(i), now: T0 }).session;
    }
    expect(s.status).toBe("completed");
    expect(s.score).toBe(STOP_COUNT * 100);
    expect(s.stops.every((p) => p.status === "solved")).toBe(true);
    expectEngineError(() => skipStop(s, content, { stopId: stopId(STOP_COUNT), now: T0 }), "session_completed");
  });
});

describe("abandonment (GAME_RULES §2)", () => {
  it("marks a session abandoned after 48 h without activity, and resumes on the next action", () => {
    const s = arriveAt1();
    expect(applyInactivity(s, later(RULES.abandonAfterMs)).status).toBe("in_progress");
    const idle = applyInactivity(s, later(RULES.abandonAfterMs + 1));
    expect(idle.status).toBe("abandoned");
    const resumed = revealHint(idle, content, { stopId: stopId(1), level: 1, now: later(RULES.abandonAfterMs + 2) });
    expect(resumed.status).toBe("in_progress");
  });
});

describe("stopScore", () => {
  it("never goes below zero", () => {
    expect(stopScore("revealed", 2)).toBe(20);
    expect(stopScore("skipped", 10)).toBe(0);
  });
});
