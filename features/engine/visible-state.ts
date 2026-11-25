/**
 * GAME_RULES §4: the ONLY projection from server content to the client.
 *
 * Built field by field from an allow-list. Never spread a content object into
 * the result: a new column added to `stops` or `challenges` must not leak just
 * because it exists. Locked stops are never read at all.
 */
import {
  canRevealAnswer,
  canSkip,
  getAnswerText,
  getChallenge,
  getHint,
  getStopAt,
  isHintAvailable,
  isInCooldown,
} from "./session";
import { seededShuffle } from "./shuffle";
import type {
  ExperienceContent,
  HintLevel,
  Session,
  SessionStop,
  Stop,
  VisibleChallenge,
  VisibleCompletedStop,
  VisibleContinueCard,
  VisibleCurrentStop,
  VisibleExperienceSummary,
  VisibleHint,
  VisibleState,
} from "./types";

const HINT_LEVELS: readonly HintLevel[] = [1, 2];

/** Public catalog facts only: counts, never the stops themselves. */
export function toVisibleSummary(content: ExperienceContent): VisibleExperienceSummary {
  const e = content.experience;
  return {
    slug: e.slug,
    title: e.title,
    tagline: e.tagline,
    description: e.description,
    kind: e.kind,
    isFlagship: e.isFlagship,
    durationMinutes: e.durationMinutes,
    distanceMeters: e.distanceMeters,
    walkingDifficulty: e.walkingDifficulty,
    nightNotes: e.nightNotes,
    recommendedStartFrom: e.recommendedStartFrom,
    recommendedStartTo: e.recommendedStartTo,
    priceCents: e.priceCents,
    currency: e.currency,
    stopCount: content.stops.length,
    puzzleCount: content.challenges.length,
  };
}

/** Built from VisibleState, so it can only ever contain what the play screen may show. */
export function toContinueCard(state: VisibleState): VisibleContinueCard | null {
  if (state.session.status === "completed" || !state.current) return null;
  return {
    sessionId: state.session.id,
    experienceTitle: state.experience.title,
    experienceSlug: state.experience.slug,
    completedCount: state.completedStops.length,
    totalStops: state.session.totalStops,
    currentPosition: state.current.position,
    currentTitle: state.current.title,
  };
}

function venueOf(stop: Stop, progress: SessionStop) {
  if (progress.usedBackupVenue && stop.backupVenue) {
    const b = stop.backupVenue;
    return { venueName: b.name, lat: b.lat, lng: b.lng, teaser: b.teaser };
  }
  return { venueName: stop.venueName, lat: stop.lat, lng: stop.lng, teaser: stop.teaser };
}

function visibleChallenge(
  session: Session,
  content: ExperienceContent,
  stop: Stop,
): VisibleChallenge {
  const challenge = getChallenge(content, stop.id);
  if (challenge.type === "text") {
    return { type: "text", prompt: challenge.prompt, placeholder: challenge.placeholder };
  }
  const ordered = [...challenge.options].sort((a, b) => a.position - b.position);
  return {
    type: "multiple_choice",
    prompt: challenge.prompt,
    options: seededShuffle(ordered, `${session.id}:${challenge.id}`).map((o) => ({
      id: o.id,
      label: o.label,
    })),
  };
}

function visibleHints(content: ExperienceContent, stop: Stop, progress: SessionStop): VisibleHint[] {
  const challenge = getChallenge(content, stop.id);
  return HINT_LEVELS.map((level) => {
    const revealed = progress.revealedHintLevels.includes(level);
    return {
      level,
      available: revealed || isHintAvailable(progress, level),
      text: revealed ? getHint(content, challenge.id, level).text : null,
    };
  });
}

function completedStop(
  content: ExperienceContent,
  stop: Stop,
  progress: SessionStop,
): VisibleCompletedStop {
  const resolution = progress.resolution ?? "skipped";
  const challenge = getChallenge(content, stop.id);
  const knowsAnswer = resolution === "answered" || resolution === "revealed";
  const venue = venueOf(stop, progress);
  return {
    stopId: stop.id,
    position: stop.position,
    title: stop.title,
    venueName: venue.venueName,
    lat: venue.lat,
    lng: venue.lng,
    resolution,
    answer: knowsAnswer ? getAnswerText(content, challenge.id) : null,
    explanation: knowsAnswer ? challenge.explanation : null,
  };
}

function currentStop(
  session: Session,
  content: ExperienceContent,
  stop: Stop,
  progress: SessionStop,
  now: Date,
): VisibleCurrentStop {
  const arrived = progress.status === "arrived";
  const venue = venueOf(stop, progress);
  return {
    stopId: stop.id,
    position: stop.position,
    title: stop.title,
    teaser: venue.teaser,
    venueName: venue.venueName,
    lat: venue.lat,
    lng: venue.lng,
    checkInRadiusM: stop.checkInRadiusM,
    status: arrived ? "arrived" : "unlocked",
    usedBackupVenue: progress.usedBackupVenue,
    story: arrived ? stop.story : null,
    challenge: arrived ? visibleChallenge(session, content, stop) : null,
    hints: arrived ? visibleHints(content, stop, progress) : [],
    canRevealAnswer: canRevealAnswer(progress),
    canSkip: canSkip(progress),
    wrongAttempts: progress.wrongAttempts,
    cooldownUntil: isInCooldown(progress, now) ? progress.cooldownUntil : null,
  };
}

export function toVisibleState(
  session: Session,
  content: ExperienceContent,
  now: Date,
  /** The stored session's version (server/session-store); 0 for unsaved state. */
  version = 0,
): VisibleState {
  const { experience } = content;
  const completedStops: VisibleCompletedStop[] = [];
  let current: VisibleCurrentStop | null = null;

  for (const progress of session.stops) {
    if (progress.status === "locked") continue; // never touch locked content
    const stop = content.stops.find((s) => s.id === progress.stopId);
    if (!stop) continue;
    if (progress.status === "solved" || progress.status === "skipped") {
      completedStops.push(completedStop(content, stop, progress));
    } else if (session.status !== "completed" && stop.position === session.currentPosition) {
      current = currentStop(session, content, getStopAt(content, stop.position), progress, now);
    }
  }
  completedStops.sort((a, b) => a.position - b.position);

  return {
    session: {
      id: session.id,
      status: session.status,
      score: session.score,
      currentPosition: session.currentPosition,
      totalStops: content.stops.length,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      endReason: session.endReason,
      version,
    },
    experience: {
      id: experience.id,
      slug: experience.slug,
      title: experience.title,
      tagline: experience.tagline,
      kind: experience.kind,
      walkingDifficulty: experience.walkingDifficulty,
      nightNotes: experience.nightNotes,
    },
    completedStops,
    current,
  };
}
