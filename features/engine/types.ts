/**
 * Domain types for the adventure engine.
 *
 * camelCase here, snake_case in Postgres (M2). Each interface maps 1:1 onto a
 * table; the repository layer does the mapping. See docs/ARCHITECTURE.md.
 *
 * Client components may import ONLY the `Visible*` types from this file.
 */

export type Id = string; // uuid
export type IsoDateTime = string; // timestamptz
export type LocalTime = string; // 'HH:MM' in Europe/Lisbon (time without tz)

// ---------------------------------------------------------------------------
// Content (server-only data)
// ---------------------------------------------------------------------------

export type ExperienceKind = "pub_crawl" | "mystery_walk" | "food_quest" | "hidden_gems";
export type WalkingDifficulty = "easy" | "moderate" | "hilly";

/** table: experiences */
export interface Experience {
  id: Id;
  slug: string;
  citySlug: "porto";
  kind: ExperienceKind;
  title: string;
  tagline: string;
  description: string;
  isFlagship: boolean;
  durationMinutes: number;
  distanceMeters: number;
  walkingDifficulty: WalkingDifficulty;
  nightNotes: string | null;
  recommendedStartFrom: LocalTime | null;
  recommendedStartTo: LocalTime | null;
  priceCents: number;
  currency: "EUR";
  status: "draft" | "published";
}

/** Stored as nullable backup_* columns on `stops`. */
export interface BackupVenue {
  name: string;
  lat: number;
  lng: number;
  teaser: string;
}

/** table: stops */
export interface Stop {
  id: Id;
  experienceId: Id;
  position: number; // 1-based, unique per experience
  title: string;
  teaser: string; // shown once unlocked
  story: string; // 50–120 words, shown after arrival
  venueName: string;
  lat: number;
  lng: number;
  checkInRadiusM: number; // default 75, allowed 50–150
  opensAt: LocalTime | null; // may cross midnight
  closesAt: LocalTime | null;
  backupVenue: BackupVenue | null;
}

export type ChallengeType = "multiple_choice" | "text";

interface ChallengeBase {
  id: Id;
  stopId: Id;
  prompt: string;
  explanation: string | null; // shown after the stop is solved
}

/** table: challenge_options */
export interface ChallengeOption {
  id: Id; // opaque; never encodes correctness
  challengeId: Id;
  label: string;
  position: number; // authoring order; shuffled per session for display
}

/** table: challenges (1:1 with stop) */
export type Challenge =
  | (ChallengeBase & { type: "multiple_choice"; options: ChallengeOption[] })
  | (ChallengeBase & { type: "text"; placeholder: string | null });

/** table: challenge_answers. SERVER ONLY (no RLS select policy in M2). */
export type AnswerKey =
  | { challengeId: Id; type: "multiple_choice"; correctOptionId: Id }
  | { challengeId: Id; type: "text"; acceptedAnswers: string[]; allowFuzzy: boolean };

export type HintLevel = 1 | 2;

/** table: hints. Server only until revealed. */
export interface Hint {
  id: Id;
  challengeId: Id;
  level: HintLevel;
  text: string;
}

/** Everything the engine needs to run one experience. Never sent to the client. */
export interface ExperienceContent {
  experience: Experience;
  stops: Stop[]; // sorted by position
  challenges: Challenge[];
  hints: Hint[];
  answerKeys: AnswerKey[];
}

// ---------------------------------------------------------------------------
// Session (per play-through progress)
// ---------------------------------------------------------------------------

export type SessionStatus = "not_started" | "in_progress" | "completed" | "abandoned";
export type StopStatus = "locked" | "unlocked" | "arrived" | "solved" | "skipped";
export type CheckInMethod = "gps" | "manual";
export type Resolution = "answered" | "revealed" | "skipped";

/** table: session_stops (PK session_id + stop_id) */
export interface SessionStop {
  stopId: Id;
  status: StopStatus;
  usedBackupVenue: boolean;
  checkInMethod: CheckInMethod | null;
  resolution: Resolution | null;
  revealedHintLevels: HintLevel[]; // sorted, e.g. [1] or [1, 2] or [2]
  wrongAttempts: number;
  consecutiveWrong: number;
  cooldownUntil: IsoDateTime | null;
  arrivedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
}

/** table: sessions */
export interface Session {
  id: Id;
  experienceId: Id;
  ownerId: Id | null; // auth.uid() from M2
  joinCode: string | null; // M4
  status: SessionStatus;
  currentPosition: number;
  score: number;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  lastActivityAt: IsoDateTime;
  stops: SessionStop[]; // M2: separate session_stops table
}

// ---------------------------------------------------------------------------
// Client DTOs: the ONLY shapes that may cross to the browser
// ---------------------------------------------------------------------------

export interface VisibleOption {
  id: Id;
  label: string;
}

export type VisibleChallenge =
  | { type: "multiple_choice"; prompt: string; options: VisibleOption[] }
  | { type: "text"; prompt: string; placeholder: string | null };

export interface VisibleHint {
  level: HintLevel;
  available: boolean;
  text: string | null; // null until revealed
}

export interface VisibleCompletedStop {
  stopId: Id;
  position: number;
  title: string;
  venueName: string;
  lat: number;
  lng: number;
  resolution: Resolution;
  /** The answer, only once the player answered or revealed it (null when skipped). */
  answer: string | null;
  explanation: string | null;
}

export interface VisibleCurrentStop {
  stopId: Id;
  position: number;
  title: string;
  teaser: string;
  venueName: string;
  lat: number;
  lng: number;
  checkInRadiusM: number;
  status: "unlocked" | "arrived";
  usedBackupVenue: boolean;
  /** Only after arrival. */
  story: string | null;
  challenge: VisibleChallenge | null;
  hints: VisibleHint[];
  canRevealAnswer: boolean;
  canSkip: boolean;
  wrongAttempts: number;
  cooldownUntil: IsoDateTime | null;
}

export interface VisibleState {
  session: {
    id: Id;
    status: SessionStatus;
    score: number;
    currentPosition: number;
    totalStops: number;
    startedAt: IsoDateTime | null;
    completedAt: IsoDateTime | null;
  };
  experience: {
    id: Id;
    slug: string;
    title: string;
    tagline: string;
    kind: ExperienceKind;
    walkingDifficulty: WalkingDifficulty;
    nightNotes: string | null;
  };
  completedStops: VisibleCompletedStop[];
  current: VisibleCurrentStop | null; // null once the session is completed
}

// ---------------------------------------------------------------------------
// Action inputs / results
// ---------------------------------------------------------------------------

export type AnswerInput = { type: "multiple_choice"; optionId: Id } | { type: "text"; text: string };

export type AnswerOutcome =
  | { outcome: "correct" }
  | { outcome: "wrong"; cooldownUntil: IsoDateTime | null }
  | { outcome: "cooldown"; cooldownUntil: IsoDateTime };
