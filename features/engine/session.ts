/**
 * Session state machine (GAME_RULES §2, §3, §6, §7).
 *
 * Pure functions: (session, content, input, now) → new session. No I/O, no clock,
 * no randomness, so every rule is unit-testable. Inputs are never mutated.
 * Every action takes the `stopId` the client believes is current, so a stale
 * double-tap (or, from M4, a second phone) can't act on the wrong stop.
 */
import { isAcceptedTextAnswer } from "./answers";
import { EngineError } from "./errors";
import { decideGpsCheckIn } from "./geo";
import { RULES } from "./rules";
import { stopScore } from "./scoring";
import type {
  AnswerInput,
  AnswerKey,
  AnswerOutcome,
  Challenge,
  CheckInMethod,
  ExperienceContent,
  GpsCheckInOutcome,
  GpsFix,
  Hint,
  HintLevel,
  Id,
  Resolution,
  Session,
  SessionStop,
  Stop,
} from "./types";

// ---------------------------------------------------------------------------
// Content lookups
// ---------------------------------------------------------------------------

export function getStopAt(content: ExperienceContent, position: number): Stop {
  const stop = content.stops.find((s) => s.position === position);
  if (!stop) throw new EngineError("content_mismatch", `No stop at position ${position}`);
  return stop;
}

export function getChallenge(content: ExperienceContent, stopId: Id): Challenge {
  const challenge = content.challenges.find((c) => c.stopId === stopId);
  if (!challenge) throw new EngineError("content_mismatch", `No challenge for stop ${stopId}`);
  return challenge;
}

export function getAnswerKey(content: ExperienceContent, challengeId: Id): AnswerKey {
  const key = content.answerKeys.find((k) => k.challengeId === challengeId);
  if (!key) throw new EngineError("content_mismatch", `No answer key for ${challengeId}`);
  return key;
}

export function getHint(content: ExperienceContent, challengeId: Id, level: HintLevel): Hint {
  const hint = content.hints.find((h) => h.challengeId === challengeId && h.level === level);
  if (!hint) throw new EngineError("content_mismatch", `No hint ${level} for ${challengeId}`);
  return hint;
}

/** Human-readable answer, used only after the player answered or revealed it. */
export function getAnswerText(content: ExperienceContent, challengeId: Id): string {
  const key = getAnswerKey(content, challengeId);
  if (key.type === "text") return key.acceptedAnswers[0] ?? "";
  const challenge = content.challenges.find((c) => c.id === challengeId);
  const option =
    challenge?.type === "multiple_choice"
      ? challenge.options.find((o) => o.id === key.correctOptionId)
      : undefined;
  if (!option) throw new EngineError("content_mismatch", `Correct option missing for ${challengeId}`);
  return option.label;
}

// ---------------------------------------------------------------------------
// Rule helpers (also used by visible-state)
// ---------------------------------------------------------------------------

/** §7: hint 1 always; hint 2 after hint 1 or after 2 wrong attempts. */
export function isHintAvailable(progress: SessionStop, level: HintLevel): boolean {
  if (progress.status !== "arrived") return false;
  if (level === 1) return true;
  return (
    progress.revealedHintLevels.includes(1) ||
    progress.wrongAttempts >= RULES.hint2AfterWrongAttempts
  );
}

/** §7: reveal answer only after hint 2 has been shown. */
export function canRevealAnswer(progress: SessionStop): boolean {
  return progress.status === "arrived" && progress.revealedHintLevels.includes(2);
}

/** §3: skip is always allowed on the current stop, before or after arrival. */
export function canSkip(progress: SessionStop): boolean {
  return progress.status === "unlocked" || progress.status === "arrived";
}

export function isInCooldown(progress: SessionStop, now: Date): boolean {
  return progress.cooldownUntil !== null && Date.parse(progress.cooldownUntil) > now.getTime();
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function freshStop(stopId: Id, status: SessionStop["status"]): SessionStop {
  return {
    stopId,
    status,
    usedBackupVenue: false,
    checkInMethod: null,
    checkInDistanceM: null,
    checkInAccuracyM: null,
    resolution: null,
    revealedHintLevels: [],
    wrongAttempts: 0,
    consecutiveWrong: 0,
    cooldownUntil: null,
    arrivedAt: null,
    completedAt: null,
  };
}

function findProgress(session: Session, stopId: Id): SessionStop {
  const progress = session.stops.find((s) => s.stopId === stopId);
  if (!progress) throw new EngineError("content_mismatch", `Session has no stop ${stopId}`);
  return progress;
}

/** Resolve the current stop and check the client is acting on it. */
function current(session: Session, content: ExperienceContent, stopId: Id) {
  if (session.experienceId !== content.experience.id) {
    throw new EngineError("content_mismatch", "Session belongs to another experience");
  }
  if (session.status === "completed") throw new EngineError("session_completed");
  const stop = getStopAt(content, session.currentPosition);
  if (stop.id !== stopId) throw new EngineError("stop_not_current");
  return { stop, progress: findProgress(session, stop.id) };
}

function requireArrived(progress: SessionStop) {
  if (progress.status !== "arrived") throw new EngineError("not_arrived");
}

/** Patch one stop, record activity and resume an abandoned session. */
function patch(session: Session, stopId: Id, changes: Partial<SessionStop>, now: Date): Session {
  return {
    ...session,
    status: session.status === "abandoned" ? "in_progress" : session.status,
    lastActivityAt: now.toISOString(),
    stops: session.stops.map((s) => (s.stopId === stopId ? { ...s, ...changes } : s)),
  };
}

function completeStop(
  session: Session,
  content: ExperienceContent,
  progress: SessionStop,
  resolution: Resolution,
  now: Date,
): Session {
  const done = patch(
    session,
    progress.stopId,
    {
      status: resolution === "skipped" ? "skipped" : "solved",
      resolution,
      cooldownUntil: null,
      completedAt: now.toISOString(),
    },
    now,
  );
  const scored = {
    ...done,
    score: done.score + stopScore(resolution, progress.revealedHintLevels.length),
  };
  return unlockNextStop(scored, content, now);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function startSession(args: {
  id: Id;
  content: ExperienceContent;
  now: Date;
  ownerId?: Id | null;
}): Session {
  const { id, content, now } = args;
  if (content.stops.length === 0) throw new EngineError("content_mismatch", "Experience has no stops");
  const sorted = [...content.stops].sort((a, b) => a.position - b.position);
  const iso = now.toISOString();
  return {
    id,
    experienceId: content.experience.id,
    ownerId: args.ownerId ?? null,
    joinCode: null,
    status: "in_progress",
    currentPosition: sorted[0]!.position,
    score: 0,
    startedAt: iso,
    completedAt: null,
    endReason: null,
    lastActivityAt: iso,
    stops: sorted.map((s, i) => freshStop(s.id, i === 0 ? "unlocked" : "locked")),
  };
}

/** §5: GPS or manual check-in. Idempotent once arrived. */
export function checkIn(
  session: Session,
  content: ExperienceContent,
  args: { stopId: Id; method: CheckInMethod; now: Date },
): Session {
  const { progress } = current(session, content, args.stopId);
  if (progress.status === "arrived") return session;
  if (progress.status !== "unlocked") throw new EngineError("stop_not_current");
  return patch(
    session,
    progress.stopId,
    { status: "arrived", checkInMethod: args.method, arrivedAt: args.now.toISOString() },
    args.now,
  );
}

/**
 * §5: GPS check-in. The server decides from the proposed fix; a rejected fix
 * (too far, inaccurate, stale) leaves the session unchanged. Idempotent once arrived.
 */
export function checkInWithGps(
  session: Session,
  content: ExperienceContent,
  args: { stopId: Id; fix: GpsFix; now: Date },
): { session: Session; result: GpsCheckInOutcome } {
  const { stop, progress } = current(session, content, args.stopId);
  if (progress.status === "arrived") {
    return {
      session,
      result: {
        outcome: "checked_in",
        distanceM: progress.checkInDistanceM ?? 0,
        accuracyM: progress.checkInAccuracyM ?? 0,
      },
    };
  }
  if (progress.status !== "unlocked") throw new EngineError("stop_not_current");

  const result = decideGpsCheckIn(stop, args.fix);
  if (result.outcome !== "checked_in") return { session, result };
  return {
    session: patch(
      session,
      progress.stopId,
      {
        status: "arrived",
        checkInMethod: "gps",
        checkInDistanceM: result.distanceM,
        checkInAccuracyM: result.accuracyM,
        arrivedAt: args.now.toISOString(),
      },
      args.now,
    ),
    result,
  };
}

/**
 * §11: "Show all remaining stops" ends the adventure first. The current and
 * locked stops are recorded as skipped with NO penalty, the score is kept, and
 * the session completes with endReason "emergency". Only after this is saved may
 * the remaining stops be shown. Idempotent once ended this way.
 */
export function endEarly(session: Session, content: ExperienceContent, args: { now: Date }): Session {
  if (session.experienceId !== content.experience.id) {
    throw new EngineError("content_mismatch", "Session belongs to another experience");
  }
  if (session.status === "completed") {
    if (session.endReason === "emergency") return session;
    throw new EngineError("session_completed");
  }
  const iso = args.now.toISOString();
  return {
    ...session,
    status: "completed",
    endReason: "emergency",
    completedAt: iso,
    lastActivityAt: iso,
    stops: session.stops.map((s) =>
      s.status === "solved" || s.status === "skipped"
        ? s
        : { ...s, status: "skipped", resolution: "skipped", cooldownUntil: null, completedAt: iso },
    ),
  };
}

/** §7. Idempotent for an already revealed level. */
export function revealHint(
  session: Session,
  content: ExperienceContent,
  args: { stopId: Id; level: HintLevel; now: Date },
): Session {
  const { progress } = current(session, content, args.stopId);
  requireArrived(progress);
  if (progress.revealedHintLevels.includes(args.level)) return session;
  if (!isHintAvailable(progress, args.level)) throw new EngineError("hint_unavailable");
  const levels = [...progress.revealedHintLevels, args.level].sort() as HintLevel[];
  return patch(session, progress.stopId, { revealedHintLevels: levels }, args.now);
}

/** §6. A correct answer completes the stop and unlocks the next one. */
export function submitAnswer(
  session: Session,
  content: ExperienceContent,
  args: { stopId: Id; answer: AnswerInput; now: Date },
): { session: Session; result: AnswerOutcome } {
  const { stop, progress } = current(session, content, args.stopId);
  requireArrived(progress);

  if (isInCooldown(progress, args.now)) {
    return { session, result: { outcome: "cooldown", cooldownUntil: progress.cooldownUntil! } };
  }

  const challenge = getChallenge(content, stop.id);
  const key = getAnswerKey(content, challenge.id);
  const { answer } = args;
  if (answer.type !== challenge.type || key.type !== challenge.type) {
    throw new EngineError("invalid_answer", "Answer type does not match the challenge");
  }

  let correct: boolean;
  if (answer.type === "multiple_choice" && challenge.type === "multiple_choice") {
    if (!challenge.options.some((o) => o.id === answer.optionId)) {
      throw new EngineError("invalid_answer", "Unknown option");
    }
    correct = key.type === "multiple_choice" && key.correctOptionId === answer.optionId;
  } else if (answer.type === "text" && key.type === "text") {
    if (answer.text.trim() === "") throw new EngineError("invalid_answer", "Empty answer");
    correct = isAcceptedTextAnswer(answer.text, key.acceptedAnswers, key.allowFuzzy);
  } else {
    throw new EngineError("invalid_answer");
  }

  if (correct) {
    return {
      session: completeStop(session, content, progress, "answered", args.now),
      result: { outcome: "correct" },
    };
  }

  const consecutiveWrong = progress.consecutiveWrong + 1;
  const cooldownUntil =
    consecutiveWrong >= RULES.cooldownAfterConsecutiveWrong
      ? new Date(args.now.getTime() + RULES.cooldownMs).toISOString()
      : null;
  return {
    session: patch(
      session,
      progress.stopId,
      { wrongAttempts: progress.wrongAttempts + 1, consecutiveWrong, cooldownUntil },
      args.now,
    ),
    result: { outcome: "wrong", cooldownUntil },
  };
}

/** §7: after hint 2, show the answer and move on (−50). */
export function revealAnswer(
  session: Session,
  content: ExperienceContent,
  args: { stopId: Id; now: Date },
): Session {
  const { progress } = current(session, content, args.stopId);
  if (!canRevealAnswer(progress)) throw new EngineError("reveal_unavailable");
  return completeStop(session, content, progress, "revealed", args.now);
}

/** §3/§7: skip at any time, even before arrival (−50). Does not reveal the answer. */
export function skipStop(
  session: Session,
  content: ExperienceContent,
  args: { stopId: Id; now: Date },
): Session {
  const { progress } = current(session, content, args.stopId);
  if (!canSkip(progress)) throw new EngineError("stop_not_current");
  return completeStop(session, content, progress, "skipped", args.now);
}

/**
 * §3: after the current stop is solved/skipped, unlock the next stop, or complete
 * the session after the final one. Called by solve/reveal/skip; exported for M4
 * (group sync) and tests.
 */
export function unlockNextStop(session: Session, content: ExperienceContent, now: Date): Session {
  const stop = getStopAt(content, session.currentPosition);
  const progress = findProgress(session, stop.id);
  if (progress.status !== "solved" && progress.status !== "skipped") {
    throw new EngineError("stop_not_current", "Current stop is not complete");
  }

  const next = content.stops.find((s) => s.position === session.currentPosition + 1);
  const iso = now.toISOString();
  if (!next) {
    return { ...session, status: "completed", endReason: "finished", completedAt: iso, lastActivityAt: iso };
  }
  // GAME_RULES §10 (backup venue when closed) is applied here from M5; M1 always uses the main venue.
  return {
    ...patch(session, next.id, { status: "unlocked" }, now),
    currentPosition: next.position,
  };
}

/** §2: an in-progress session with no activity for 48 h counts as abandoned. */
export function applyInactivity(session: Session, now: Date): Session {
  if (session.status !== "in_progress") return session;
  const idle = now.getTime() - Date.parse(session.lastActivityAt);
  return idle > RULES.abandonAfterMs ? { ...session, status: "abandoned" } : session;
}
