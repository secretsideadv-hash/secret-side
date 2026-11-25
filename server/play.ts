import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import {
  applyInactivity,
  checkIn,
  checkInWithGps,
  endEarly,
  revealAnswer,
  revealHint,
  skipStop,
  startSession,
  submitAnswer,
  toContinueCard,
  toVisibleState,
  type AnswerInput,
  type AnswerOutcome,
  type ExperienceContent,
  type GpsCheckInOutcome,
  type GpsFix,
  type HintLevel,
  type Id,
  type Session,
  type VisibleContinueCard,
  type VisibleState,
} from "@/features/engine";
import { getExperienceContent } from "./content";
import { contentRepository } from "./content-repository";
import { currentGuestId, ensureGuest } from "./guest";
import {
  createSession,
  loadOwnSession,
  loadUnfinishedSession,
  saveSession,
  type StoredSession,
} from "./session-store";

/**
 * Server use-cases for the play flow: who is playing → load their session →
 * engine → save with the version check → project. Server Actions are thin
 * wrappers around these. Everything returned is a VisibleState, never content.
 */

/** M1 stored the session in this cookie; cleared on the next unlock. */
const LEGACY_SESSION_COOKIE = "ss_session";

async function contentFor(session: Session): Promise<ExperienceContent> {
  const content = await getExperienceContent(session.experienceId);
  if (!content) throw new Error("Experience content not found");
  return content;
}

function project(stored: StoredSession, content: ExperienceContent, now: Date): VisibleState {
  // Display only: the hourly job saves "abandoned"; the next action resumes it.
  return toVisibleState(applyInactivity(stored.session, now), content, now, stored.version);
}

/**
 * "Unlock adventure" (Server Action only: may sign the guest in, which sets
 * cookies). Resumes the guest's unfinished session for this experience,
 * otherwise starts one. Returns the session id.
 */
export async function startOrResumePlay(slug: string): Promise<Id> {
  const summary = await contentRepository.getSummaryBySlug(slug);
  if (!summary) throw new Error("Unknown experience");
  const content = await getExperienceContent(summary.experience.id);
  if (!content) throw new Error("Experience content not found");

  const guestId = await ensureGuest();
  (await cookies()).delete(LEGACY_SESSION_COOKIE);

  const existing = await loadUnfinishedSession(guestId, content.experience.id);
  if (existing) return existing.session.id;

  // MOCK: free until M6. From then this requires an entitlement created by the Stripe webhook.
  const session = startSession({ id: randomUUID(), content, now: new Date(), ownerId: guestId });
  return createSession(session, guestId); // the existing id if a parallel tap won the race
}

/** For Server Components. Null unless the session belongs to this browser's guest. */
export async function getPlayState(sessionId: Id): Promise<VisibleState | null> {
  await connection(); // per-request: cookies and the clock
  const guestId = await currentGuestId();
  if (!guestId) return null;
  const stored = await loadOwnSession(sessionId, guestId);
  if (!stored) return null;
  return project(stored, await contentFor(stored.session), new Date());
}

/** Discover's "Continue" card: this guest's most recent unfinished session. */
export async function getContinueCard(): Promise<VisibleContinueCard | null> {
  await connection();
  const guestId = await currentGuestId();
  if (!guestId) return null;
  const stored = await loadUnfinishedSession(guestId);
  if (!stored) return null;
  const content = await getExperienceContent(stored.session.experienceId);
  if (!content) return null;
  return toContinueCard(project(stored, content, new Date()));
}

type Mutation<R> = (
  session: Session,
  content: ExperienceContent,
  now: Date,
) => { session: Session; result: R };

export type MutationOutcome<R> =
  | { kind: "ok"; state: VisibleState; result: R }
  | { kind: "not_found" } // not this guest's session (or no guest)
  | { kind: "stale" }; // built on an older version: replay, double tap, other tab

/**
 * Load → engine → save, only if the client acted on the version it was shown
 * and nobody wrote in between. Engine errors (EngineError) propagate.
 */
async function mutate<R>(sessionId: Id, expectedVersion: number, fn: Mutation<R>): Promise<MutationOutcome<R>> {
  const guestId = await currentGuestId();
  if (!guestId) return { kind: "not_found" };
  const stored = await loadOwnSession(sessionId, guestId);
  if (!stored) return { kind: "not_found" };
  if (stored.version !== expectedVersion) return { kind: "stale" };

  const content = await contentFor(stored.session);
  const now = new Date();
  const { session, result } = fn(stored.session, content, now);
  if (session === stored.session) {
    return { kind: "ok", state: toVisibleState(session, content, now, stored.version), result };
  }
  const version = await saveSession(session, guestId, stored.version);
  if (version === null) return { kind: "stale" };
  return { kind: "ok", state: toVisibleState(session, content, now, version), result };
}

const unit = (session: Session) => ({ session, result: null });

export const playCheckIn = (sessionId: Id, version: number, stopId: Id) =>
  mutate(sessionId, version, (s, c, now) => unit(checkIn(s, c, { stopId, method: "manual", now })));

/** §5: the server decides from the proposed fix; a rejected fix changes nothing. */
export const playGpsCheckIn = (sessionId: Id, version: number, stopId: Id, fix: GpsFix) =>
  mutate<GpsCheckInOutcome>(sessionId, version, (s, c, now) => checkInWithGps(s, c, { stopId, fix, now }));

/** §11: ends the session (no penalty, score kept) so the remaining stops may be shown. */
export const playEndEarly = (sessionId: Id, version: number) =>
  mutate(sessionId, version, (s, c, now) => unit(endEarly(s, c, { now })));

export const playRevealHint = (sessionId: Id, version: number, stopId: Id, level: HintLevel) =>
  mutate(sessionId, version, (s, c, now) => unit(revealHint(s, c, { stopId, level, now })));

export const playSubmitAnswer = (sessionId: Id, version: number, stopId: Id, answer: AnswerInput) =>
  mutate<AnswerOutcome>(sessionId, version, (s, c, now) => submitAnswer(s, c, { stopId, answer, now }));

export const playRevealAnswer = (sessionId: Id, version: number, stopId: Id) =>
  mutate(sessionId, version, (s, c, now) => unit(revealAnswer(s, c, { stopId, now })));

export const playSkip = (sessionId: Id, version: number, stopId: Id) =>
  mutate(sessionId, version, (s, c, now) => unit(skipStop(s, c, { stopId, now })));
