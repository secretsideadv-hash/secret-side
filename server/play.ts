import "server-only";

import { randomUUID } from "node:crypto";
import {
  applyInactivity,
  checkIn,
  revealAnswer,
  revealHint,
  skipStop,
  startSession,
  submitAnswer,
  toVisibleState,
  type AnswerInput,
  type AnswerOutcome,
  type ExperienceContent,
  type HintLevel,
  type Id,
  type Session,
  type VisibleState,
} from "@/features/engine";
import { contentRepository } from "./content-repository";
import { loadSession, saveSession } from "./session-store";

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

/** Starts a new session for a published experience and returns its id. */
export async function startPlay(slug: string): Promise<Id> {
  const summary = await contentRepository.getSummaryBySlug(slug);
  if (!summary) throw new Error("Unknown experience");
  const content = await contentRepository.getContent(summary.experience.id);
  if (!content) throw new Error("Experience content not found");
  const session = startSession({ id: randomUUID(), content, now: new Date() });
  await saveSession(session);
  return session.id;
}

/** For Server Components. Null if this browser's cookie doesn't hold that session. */
export async function getPlayState(sessionId: Id): Promise<VisibleState | null> {
  const stored = await loadSession(sessionId);
  if (!stored) return null;
  const now = new Date();
  return toVisibleState(applyInactivity(stored, now), await contentFor(stored), now);
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
