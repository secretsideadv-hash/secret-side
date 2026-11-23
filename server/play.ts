import "server-only";

import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import {
  applyInactivity,
  checkIn,
  revealAnswer,
  revealHint,
  skipStop,
  startSession,
  submitAnswer,
  toContinueCard,
  toVisibleState,
  type VisibleContinueCard,
  type AnswerInput,
  type AnswerOutcome,
  type ExperienceContent,
  type HintLevel,
  type Id,
  type Session,
  type VisibleState,
} from "@/features/engine";
import { contentRepository } from "./content-repository";
import { loadCurrentSession, loadSession, saveSession } from "./session-store";

/**
 * Server use-cases for the play flow: load → engine → save → project.
 * Server Actions (M1 step 4) are thin wrappers around these. Everything returned
 * is a VisibleState, never raw content.
 */

async function contentFor(session: Session): Promise<ExperienceContent> {
  const content = await contentRepository.getContent(session.experienceId);
  if (!content) throw new Error("Experience content not found");
  return content;
}

/**
 * "Unlock adventure": resumes this browser's unfinished session for the same
 * experience, otherwise starts a new one. Returns the session id.
 * (M1 holds one session per browser, so starting a different adventure replaces it.)
 */
export async function startOrResumePlay(slug: string): Promise<Id> {
  const summary = await contentRepository.getSummaryBySlug(slug);
  if (!summary) throw new Error("Unknown experience");
  const content = await contentRepository.getContent(summary.experience.id);
  if (!content) throw new Error("Experience content not found");

  const existing = await loadCurrentSession();
  if (existing && existing.experienceId === content.experience.id && existing.status !== "completed") {
    return existing.id;
  }

  // MOCK: free in M1. From M6 this requires an entitlement created by the Stripe webhook.
  const session = startSession({ id: randomUUID(), content, now: new Date() });
  await saveSession(session);
  return session.id;
}

/** For Server Components. Null if this browser's cookie doesn't hold that session. */
export async function getPlayState(sessionId: Id): Promise<VisibleState | null> {
  await connection(); // per-request: reads the clock
  const stored = await loadSession(sessionId);
  if (!stored) return null;
  const now = new Date();
  return toVisibleState(applyInactivity(stored, now), await contentFor(stored), now);
}

/** Discover's "Continue" card: this browser's unfinished session, if any. */
export async function getContinueCard(): Promise<VisibleContinueCard | null> {
  await connection(); // per-request: reads the clock
  const stored = await loadCurrentSession();
  if (!stored) return null;
  const content = await contentRepository.getContent(stored.experienceId);
  if (!content) return null;
  const now = new Date();
  return toContinueCard(toVisibleState(applyInactivity(stored, now), content, now));
}

type Mutation<R> = (
  session: Session,
  content: ExperienceContent,
  now: Date,
) => { session: Session; result: R };

async function mutate<R>(
  sessionId: Id,
  fn: Mutation<R>,
): Promise<{ state: VisibleState; result: R } | null> {
  const stored = await loadSession(sessionId);
  if (!stored) return null;
  const content = await contentFor(stored);
  const now = new Date();
  const { session, result } = fn(stored, content, now);
  if (session !== stored) await saveSession(session);
  return { state: toVisibleState(session, content, now), result };
}

const unit = (session: Session) => ({ session, result: null });

export const playCheckIn = (sessionId: Id, stopId: Id) =>
  mutate(sessionId, (s, c, now) => unit(checkIn(s, c, { stopId, method: "manual", now })));

export const playRevealHint = (sessionId: Id, stopId: Id, level: HintLevel) =>
  mutate(sessionId, (s, c, now) => unit(revealHint(s, c, { stopId, level, now })));

export const playSubmitAnswer = (sessionId: Id, stopId: Id, answer: AnswerInput) =>
  mutate<AnswerOutcome>(sessionId, (s, c, now) => submitAnswer(s, c, { stopId, answer, now }));

export const playRevealAnswer = (sessionId: Id, stopId: Id) =>
  mutate(sessionId, (s, c, now) => unit(revealAnswer(s, c, { stopId, now })));

export const playSkip = (sessionId: Id, stopId: Id) =>
  mutate(sessionId, (s, c, now) => unit(skipStop(s, c, { stopId, now })));
