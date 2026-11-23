/**
 * The "never expose locked stops or answers" rule (CLAUDE.md, GAME_RULES §4).
 *
 * Plays through the sentinel fixture along a path that exercises every
 * transition, serialises the client state after every step, and checks that no
 * secret that shouldn't be visible yet appears anywhere in it.
 */
import { describe, expect, it } from "vitest";
import {
  buildSentinelContent,
  correctAnswerFor,
  correctOptionId,
  isMultipleChoice,
  stopId,
  textAnswer,
  wrongAnswerFor,
} from "./__fixtures__/sentinel-content";
import { checkIn, revealAnswer, revealHint, skipStop, startSession, submitAnswer } from "./session";
import type { ExperienceContent, Session, VisibleState } from "./types";
import { toContinueCard, toVisibleState, toVisibleSummary } from "./visible-state";

const content = buildSentinelContent();
const NOW = new Date("2026-11-23T20:00:00.000Z");

const FORBIDDEN_KEYS = new Set([
  "acceptedAnswers",
  "correctOptionId",
  "allowFuzzy",
  "answerKeys",
  "isCorrect",
  "correct",
  "backupVenue",
  "stops", // raw content/session arrays
  "revealedHintLevels", // raw session progress
]);

function collectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, keys));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      collectKeys(v, keys);
    }
  }
  return keys;
}

function stopSecrets(c: ExperienceContent, i: number) {
  const stop = c.stops.find((s) => s.position === i)!;
  const challenge = c.challenges.find((ch) => ch.stopId === stop.id)!;
  return {
    identity: [stop.id, stop.title, stop.teaser, stop.venueName, String(stop.lat), String(stop.lng)],
    story: [stop.story],
    question: [
      challenge.prompt,
      ...(challenge.type === "multiple_choice" ? challenge.options.flatMap((o) => [o.id, o.label]) : []),
    ],
    hints: c.hints.filter((h) => h.challengeId === challenge.id),
    explanation: challenge.explanation ? [challenge.explanation] : [],
    answer: isMultipleChoice(i) ? [] : [textAnswer(i)], // MC correctness is checked structurally
  };
}

/** Everything that must NOT appear in the client state for this session. */
function forbiddenStrings(session: Session, c: ExperienceContent): string[] {
  const forbidden: string[] = ["BACKUPVENUE_4_ZQ", "BACKUPTEASER_4_ZQ", "39.98765"];
  for (const progress of session.stops) {
    const i = c.stops.find((s) => s.id === progress.stopId)!.position;
    const secret = stopSecrets(c, i);
    const unrevealedHints = secret.hints
      .filter((h) => !progress.revealedHintLevels.includes(h.level))
      .map((h) => h.text);

    switch (progress.status) {
      case "locked":
        forbidden.push(
          ...secret.identity,
          ...secret.story,
          ...secret.question,
          ...secret.hints.map((h) => h.text),
          ...secret.explanation,
          ...secret.answer,
        );
        break;
      case "unlocked": // teaser + location only
        forbidden.push(...secret.story, ...secret.question, ...unrevealedHints, ...secret.explanation, ...secret.answer);
        break;
      case "arrived":
        forbidden.push(...unrevealedHints, ...secret.explanation, ...secret.answer);
        break;
      case "skipped": // skipping never reveals the answer
        forbidden.push(...secret.explanation, ...secret.answer, ...unrevealedHints);
        break;
      case "solved":
        forbidden.push(...unrevealedHints);
        break;
    }
  }
  return forbidden;
}

function assertNoLeaks(session: Session, c: ExperienceContent, label: string): VisibleState {
  const state = toVisibleState(session, c, NOW);
  const json = JSON.stringify(state);

  for (const secret of forbiddenStrings(session, c)) {
    expect(json, `${label}: leaked ${JSON.stringify(secret)}`).not.toContain(secret);
  }

  const keys = collectKeys(state);
  for (const key of FORBIDDEN_KEYS) expect(keys.has(key), `${label}: has key ${key}`).toBe(false);

  // MC options carry no correctness signal: exactly {id, label}.
  for (const option of state.current?.challenge?.type === "multiple_choice" ? state.current.challenge.options : []) {
    expect(Object.keys(option).sort(), label).toEqual(["id", "label"]);
  }

  // A skipped stop never exposes its answer, even structurally.
  for (const done of state.completedStops) {
    if (done.resolution === "skipped") expect(done.answer, label).toBeNull();
  }
  return state;
}

describe("never expose locked stops or answers", () => {
  it("holds at every step of a play-through that uses every transition", () => {
    let s = startSession({ id: "session-leak", content, now: NOW });
    const step = (label: string, next: Session) => {
      s = next;
      return assertNoLeaks(s, content, label);
    };
    const now = NOW;

    assertNoLeaks(s, content, "start");

    // Stop 1 (MC): wrong twice, hint 2 directly, then correct.
    step("1 arrive", checkIn(s, content, { stopId: stopId(1), method: "manual", now }));
    step("1 wrong", submitAnswer(s, content, { stopId: stopId(1), answer: wrongAnswerFor(1), now }).session);
    step("1 wrong 2", submitAnswer(s, content, { stopId: stopId(1), answer: wrongAnswerFor(1), now }).session);
    step("1 hint 2", revealHint(s, content, { stopId: stopId(1), level: 2, now }));
    step("1 correct", submitAnswer(s, content, { stopId: stopId(1), answer: correctAnswerFor(1), now }).session);

    // Stop 2 (text): both hints, then reveal.
    step("2 arrive", checkIn(s, content, { stopId: stopId(2), method: "gps", now }));
    step("2 hint 1", revealHint(s, content, { stopId: stopId(2), level: 1, now }));
    step("2 hint 2", revealHint(s, content, { stopId: stopId(2), level: 2, now }));
    step("2 reveal", revealAnswer(s, content, { stopId: stopId(2), now }));

    // Stop 3 (MC): skipped before arrival.
    step("3 skip", skipStop(s, content, { stopId: stopId(3), now }));

    // Stop 4 (text, has unused backup venue): hint 1, then skip after arrival.
    step("4 arrive", checkIn(s, content, { stopId: stopId(4), method: "manual", now }));
    step("4 hint 1", revealHint(s, content, { stopId: stopId(4), level: 1, now }));
    step("4 skip", skipStop(s, content, { stopId: stopId(4), now }));

    // Stop 5 (MC): straight answer → completed.
    step("5 arrive", checkIn(s, content, { stopId: stopId(5), method: "manual", now }));
    const final = step(
      "5 correct",
      submitAnswer(s, content, { stopId: stopId(5), answer: correctAnswerFor(5), now }).session,
    );

    expect(final.session.status).toBe("completed");
    expect(final.current).toBeNull();
    expect(final.completedStops.map((d) => d.resolution)).toEqual([
      "answered",
      "revealed",
      "skipped",
      "skipped",
      "answered",
    ]);
  });

  it("at the start the client sees stop 1's teaser and location only, and no other stop", () => {
    const state = toVisibleState(startSession({ id: "s", content, now: NOW }), content, NOW);
    expect(state.completedStops).toEqual([]);
    expect(state.current).toMatchObject({
      stopId: stopId(1),
      title: "TITLE_1_ZQ",
      teaser: "TEASER_1_ZQ",
      status: "unlocked",
      story: null,
      challenge: null,
      hints: [],
      canSkip: true,
      canRevealAnswer: false,
    });
    expect(state.session.totalStops).toBe(5);
  });

  it("after arrival: story, question and hint availability, but hint text only once revealed", () => {
    let s = startSession({ id: "s", content, now: NOW });
    s = checkIn(s, content, { stopId: stopId(1), method: "manual", now: NOW });
    const state = toVisibleState(s, content, NOW);
    expect(state.current?.story).toBe("STORY_1_ZQ");
    expect(state.current?.challenge?.prompt).toBe("PROMPT_1_ZQ");
    expect(state.current?.hints).toEqual([
      { level: 1, available: true, text: null },
      { level: 2, available: false, text: null },
    ]);
  });

  it("unlocking returns the next stop's name, coordinates and teaser, not its story or question", () => {
    let s = startSession({ id: "s", content, now: NOW });
    s = skipStop(s, content, { stopId: stopId(1), now: NOW });
    const next = toVisibleState(s, content, NOW).current!;
    expect(next).toMatchObject({ title: "TITLE_2_ZQ", teaser: "TEASER_2_ZQ", venueName: "VENUE_2_ZQ", status: "unlocked" });
    expect(next.lat).toBeCloseTo(40.2469);
    expect(next.story).toBeNull();
    expect(next.challenge).toBeNull();
  });

  it("completed stops show the answer only when it was answered or revealed", () => {
    let s = startSession({ id: "s", content, now: NOW });
    s = checkIn(s, content, { stopId: stopId(1), method: "manual", now: NOW });
    s = submitAnswer(s, content, { stopId: stopId(1), answer: correctAnswerFor(1), now: NOW }).session;
    s = skipStop(s, content, { stopId: stopId(2), now: NOW });
    const [first, second] = toVisibleState(s, content, NOW).completedStops;
    expect(first).toMatchObject({ resolution: "answered", answer: "OPTLABEL_1_3_ZQ", explanation: "EXPLAIN_1_ZQ" });
    expect(second).toMatchObject({ resolution: "skipped", answer: null, explanation: null });
  });

  it("multiple-choice order is stable per session and varies between sessions", () => {
    const optionsFor = (id: string) => {
      let s = startSession({ id, content, now: NOW });
      s = checkIn(s, content, { stopId: stopId(1), method: "manual", now: NOW });
      const ch = toVisibleState(s, content, NOW).current!.challenge!;
      return ch.type === "multiple_choice" ? ch.options.map((o) => o.id) : [];
    };
    expect(optionsFor("same")).toEqual(optionsFor("same"));
    const correctSlots = new Set(
      Array.from({ length: 30 }, (_, n) => optionsFor(`session-${n}`).indexOf(correctOptionId(1))),
    );
    expect(correctSlots.size).toBeGreaterThan(1);
  });
});

describe("catalog and Continue-card projections", () => {
  it("the summary has counts but no stop, challenge, hint or answer content", () => {
    const summary = toVisibleSummary(content);
    expect(summary).toMatchObject({ slug: "sentinel", stopCount: 5, puzzleCount: 5 });
    const json = JSON.stringify(summary);
    expect(json).not.toMatch(/_ZQ|zq|stopid|optid|chalid/);
    expect(collectKeys(summary).has("id")).toBe(false);
  });

  it("the Continue card shows progress and the current stop only", () => {
    let s = startSession({ id: "s", content, now: NOW });
    s = skipStop(s, content, { stopId: stopId(1), now: NOW });
    const card = toContinueCard(toVisibleState(s, content, NOW));
    expect(card).toEqual({
      sessionId: "s",
      experienceTitle: "Sentinel",
      experienceSlug: "sentinel",
      completedCount: 1,
      totalStops: 5,
      currentPosition: 2,
      currentTitle: "TITLE_2_ZQ",
    });
    expect(JSON.stringify(card)).not.toMatch(/TITLE_[345]|STORY|HINT|EXPLAIN|Answerword/);
  });

  it("there is no Continue card once the session is completed", () => {
    let s = startSession({ id: "s", content, now: NOW });
    for (let i = 1; i <= 5; i++) s = skipStop(s, content, { stopId: stopId(i), now: NOW });
    expect(toContinueCard(toVisibleState(s, content, NOW))).toBeNull();
  });
});
