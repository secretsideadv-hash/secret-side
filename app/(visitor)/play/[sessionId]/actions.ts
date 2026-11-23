"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { EngineError, type EngineErrorCode, type VisibleState } from "@/features/engine";
import type { PlayActionResult, PlayErrorCode } from "@/lib/play-types";
import {
  playCheckIn,
  playRevealAnswer,
  playRevealHint,
  playSkip,
  playSubmitAnswer,
} from "@/server/play";

/**
 * Play-flow Server Actions. They are public HTTP endpoints: every input is
 * validated, the engine decides, and only VisibleState goes back. Answers are
 * checked here on the server, never in the browser.
 */

const idSchema = z.uuid();
const hintLevelSchema = z.union([z.literal(1), z.literal(2)]);
const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("multiple_choice"), optionId: z.uuid() }),
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(100) }),
]);

const ENGINE_TO_PLAY_ERROR: Record<EngineErrorCode, PlayErrorCode> = {
  session_completed: "stale",
  stop_not_current: "stale",
  not_arrived: "not_allowed",
  hint_unavailable: "not_allowed",
  reveal_unavailable: "not_allowed",
  invalid_answer: "invalid",
  content_mismatch: "stale",
};

type Run = { state: VisibleState } | null;

/** Runs a use-case and maps engine errors; anything else is a real bug and is thrown. */
async function run<R extends Run>(fn: () => Promise<R>): Promise<{ ok: true; value: NonNullable<R> } | { ok: false; error: PlayErrorCode }> {
  try {
    const value = await fn();
    return value ? { ok: true, value } : { ok: false, error: "not_found" };
  } catch (error) {
    if (error instanceof EngineError) return { ok: false, error: ENGINE_TO_PLAY_ERROR[error.code] };
    throw error;
  }
}

/** After a stop is completed: the Unlocked screen, or the finale. */
function redirectAfterStop(state: VisibleState): never {
  const base = `/play/${state.session.id}`;
  redirect(state.session.status === "completed" ? `${base}/complete` : `${base}/unlocked`);
}

function parseIds(sessionId: unknown, stopId: unknown) {
  const s = idSchema.safeParse(sessionId);
  const t = idSchema.safeParse(stopId);
  return s.success && t.success ? { sessionId: s.data, stopId: t.data } : null;
}

export async function checkInAction(sessionId: string, stopId: string): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, stopId);
  if (!ids) return { ok: false, error: "invalid" };
  const r = await run(() => playCheckIn(ids.sessionId, ids.stopId));
  return r.ok ? { ok: true, state: r.value.state } : r;
}

export async function revealHintAction(
  sessionId: string,
  stopId: string,
  level: number,
): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, stopId);
  const lvl = hintLevelSchema.safeParse(level);
  if (!ids || !lvl.success) return { ok: false, error: "invalid" };
  const r = await run(() => playRevealHint(ids.sessionId, ids.stopId, lvl.data));
  return r.ok ? { ok: true, state: r.value.state } : r;
}

export async function submitAnswerAction(
  sessionId: string,
  stopId: string,
  answer: unknown,
): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, stopId);
  const parsed = answerSchema.safeParse(answer);
  if (!ids || !parsed.success) return { ok: false, error: "invalid" };
  const r = await run(() => playSubmitAnswer(ids.sessionId, ids.stopId, parsed.data));
  if (!r.ok) return r;
  if (r.value.result.outcome === "correct") redirectAfterStop(r.value.state);
  return { ok: true, state: r.value.state, outcome: r.value.result };
}

export async function revealAnswerAction(sessionId: string, stopId: string): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, stopId);
  if (!ids) return { ok: false, error: "invalid" };
  const r = await run(() => playRevealAnswer(ids.sessionId, ids.stopId));
  if (!r.ok) return r;
  redirectAfterStop(r.value.state);
}

export async function skipStopAction(sessionId: string, stopId: string): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, stopId);
  if (!ids) return { ok: false, error: "invalid" };
  const r = await run(() => playSkip(ids.sessionId, ids.stopId));
  if (!r.ok) return r;
  redirectAfterStop(r.value.state);
}
