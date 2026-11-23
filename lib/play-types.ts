import type { AnswerInput, AnswerOutcome, HintLevel, Id, VisibleState } from "@/features/engine/types";

/** Errors the Play screen can recover from (refresh, retry, or start again). */
export type PlayErrorCode =
  | "not_found" // this browser doesn't hold the session
  | "stale" // the stop moved on (double tap, another tab)
  | "not_allowed" // e.g. hint not available yet
  | "invalid"; // malformed input

export type PlayActionResult =
  | { ok: true; state: VisibleState; outcome?: AnswerOutcome }
  | { ok: false; error: PlayErrorCode };

/**
 * Server Actions the Play screen calls. Passed from the page as props so
 * presentation components never import server code. Actions that complete a
 * stop redirect to the Unlocked/Complete screen instead of returning.
 */
export interface PlayActions {
  checkIn(sessionId: Id, stopId: Id): Promise<PlayActionResult>;
  revealHint(sessionId: Id, stopId: Id, level: HintLevel): Promise<PlayActionResult>;
  submitAnswer(sessionId: Id, stopId: Id, answer: AnswerInput): Promise<PlayActionResult>;
  revealAnswer(sessionId: Id, stopId: Id): Promise<PlayActionResult>;
  skip(sessionId: Id, stopId: Id): Promise<PlayActionResult>;
}
