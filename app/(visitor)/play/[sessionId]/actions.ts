"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { EngineError, type EngineErrorCode, type VisibleState } from "@/features/engine";
import type { PlayActionResult, PlayErrorCode } from "@/lib/play-types";
import {
  playCheckIn,
  playEndEarly,
  playGpsCheckIn,
  playRevealAnswer,
  playRevealHint,
  playSkip,
  playSubmitAnswer,
  type MutationOutcome,
} from "@/server/play";

/**
 * Play-flow Server Actions. They are public HTTP endpoints: every input is
 * validated, the engine decides, and only VisibleState goes back. Answers are
 * checked here on the server, never in the browser.
 *
 * Every action carries the state version the screen was showing. The server
 * writes only if the stored session is still at that version, so a replayed or
 * duplicated request (or one from a stale tab) is rejected as "stale".
 */

const idSchema = z.uuid();
const versionSchema = z.number().int().nonnegative().max(1_000_000);
const hintLevelSchema = z.union([z.literal(1), z.literal(2)]);
/** A proposed GPS fix (GAME_RULES §5). Plausibility only; the engine decides. */
const gpsFixSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().positive().max(100_000),
  ageMs: z.number().int().min(-3_600_000).max(86_400_000),
});
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

/** Runs a use-case and maps its outcome and engine errors; anything else is a real bug and is thrown. */
async function run<R>(
  fn: () => Promise<MutationOutcome<R>>,
): Promise<{ ok: true; value: { state: VisibleState; result: R } } | { ok: false; error: PlayErrorCode }> {
  try {
    const outcome = await fn();
    if (outcome.kind === "ok") return { ok: true, value: outcome };
    return { ok: false, error: outcome.kind };
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

function parseIds(sessionId: unknown, version: unknown, stopId: unknown) {
  const s = idSchema.safeParse(sessionId);
  const v = versionSchema.safeParse(version);
  const t = idSchema.safeParse(stopId);
  return s.success && v.success && t.success ? { sessionId: s.data, version: v.data, stopId: t.data } : null;
}

export async function checkInAction(sessionId: string, version: number, stopId: string): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, version, stopId);
  if (!ids) return { ok: false, error: "invalid" };
  const r = await run(() => playCheckIn(ids.sessionId, ids.version, ids.stopId));
  return r.ok ? { ok: true, state: r.value.state } : r;
}

export async function gpsCheckInAction(
  sessionId: string,
  version: number,
  stopId: string,
  fix: unknown,
): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, version, stopId);
  const parsed = gpsFixSchema.safeParse(fix);
  if (!ids || !parsed.success) return { ok: false, error: "invalid" };
  const r = await run(() => playGpsCheckIn(ids.sessionId, ids.version, ids.stopId, parsed.data));
  return r.ok ? { ok: true, state: r.value.state, checkIn: r.value.result } : r;
}

/** Emergency view: end the adventure on the server first (§11), then show the finale with every stop. */
export async function endEarlyAction(sessionId: string, version: number): Promise<PlayActionResult> {
  const s = idSchema.safeParse(sessionId);
  const v = versionSchema.safeParse(version);
  if (!s.success || !v.success) return { ok: false, error: "invalid" };
  const r = await run(() => playEndEarly(s.data, v.data));
  if (!r.ok) return r;
  redirect(`/play/${r.value.state.session.id}/complete`);
}

export async function revealHintAction(
  sessionId: string,
  version: number,
  stopId: string,
  level: number,
): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, version, stopId);
  const lvl = hintLevelSchema.safeParse(level);
  if (!ids || !lvl.success) return { ok: false, error: "invalid" };
  const r = await run(() => playRevealHint(ids.sessionId, ids.version, ids.stopId, lvl.data));
  return r.ok ? { ok: true, state: r.value.state } : r;
}

export async function submitAnswerAction(
  sessionId: string,
  version: number,
  stopId: string,
  answer: unknown,
): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, version, stopId);
  const parsed = answerSchema.safeParse(answer);
  if (!ids || !parsed.success) return { ok: false, error: "invalid" };
  const r = await run(() => playSubmitAnswer(ids.sessionId, ids.version, ids.stopId, parsed.data));
  if (!r.ok) return r;
  if (r.value.result.outcome === "correct") redirectAfterStop(r.value.state);
  return { ok: true, state: r.value.state, outcome: r.value.result };
}

export async function revealAnswerAction(
  sessionId: string,
  version: number,
  stopId: string,
): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, version, stopId);
  if (!ids) return { ok: false, error: "invalid" };
  const r = await run(() => playRevealAnswer(ids.sessionId, ids.version, ids.stopId));
  if (!r.ok) return r;
  redirectAfterStop(r.value.state);
}

export async function skipStopAction(sessionId: string, version: number, stopId: string): Promise<PlayActionResult> {
  const ids = parseIds(sessionId, version, stopId);
  if (!ids) return { ok: false, error: "invalid" };
  const r = await run(() => playSkip(ids.sessionId, ids.version, ids.stopId));
  if (!r.ok) return r;
  redirectAfterStop(r.value.state);
}
