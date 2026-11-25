/**
 * Engine `Session` (camelCase) ⇄ `sessions` / `session_stops` rows (snake_case).
 * Reads are validated with Zod so a schema drift fails loudly instead of
 * feeding the engine bad data. Pure: no I/O, usable from tests.
 */
import { z } from "zod";
import type { HintLevel, Session, SessionStop } from "@/features/engine/types";

/** Postgres timestamptz → the engine's ISO strings (UTC, milliseconds). */
const timestamp = z.string().transform((value) => new Date(value).toISOString());

const sessionStopRow = z.object({
  stop_id: z.uuid(),
  status: z.enum(["locked", "unlocked", "arrived", "solved", "skipped"]),
  used_backup_venue: z.boolean(),
  check_in_method: z.enum(["gps", "manual"]).nullable(),
  resolution: z.enum(["answered", "revealed", "skipped"]).nullable(),
  revealed_hint_levels: z.array(z.union([z.literal(1), z.literal(2)])),
  wrong_attempts: z.number().int().nonnegative(),
  consecutive_wrong: z.number().int().nonnegative(),
  cooldown_until: timestamp.nullable(),
  arrived_at: timestamp.nullable(),
  completed_at: timestamp.nullable(),
});

export const storedSessionRowSchema = z.object({
  id: z.uuid(),
  experience_id: z.uuid(),
  owner_id: z.uuid(),
  join_code: z.string().nullable(),
  status: z.enum(["not_started", "in_progress", "completed", "abandoned"]),
  current_position: z.number().int().positive(),
  score: z.number().int().nonnegative(),
  started_at: timestamp.nullable(),
  completed_at: timestamp.nullable(),
  last_activity_at: timestamp,
  version: z.number().int().nonnegative(),
  session_stops: z.array(sessionStopRow),
});

/** A session as stored: the engine state plus the optimistic-concurrency version. */
export interface StoredSession {
  session: Session;
  version: number;
}

export function sessionFromRow(raw: unknown): StoredSession {
  const r = storedSessionRowSchema.parse(raw);
  return {
    version: r.version,
    session: {
      id: r.id,
      experienceId: r.experience_id,
      ownerId: r.owner_id,
      joinCode: r.join_code,
      status: r.status,
      currentPosition: r.current_position,
      score: r.score,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      lastActivityAt: r.last_activity_at,
      stops: r.session_stops.map(
        (s): SessionStop => ({
          stopId: s.stop_id,
          status: s.status,
          usedBackupVenue: s.used_backup_venue,
          checkInMethod: s.check_in_method,
          resolution: s.resolution,
          revealedHintLevels: [...s.revealed_hint_levels].sort() as HintLevel[],
          wrongAttempts: s.wrong_attempts,
          consecutiveWrong: s.consecutive_wrong,
          cooldownUntil: s.cooldown_until,
          arrivedAt: s.arrived_at,
          completedAt: s.completed_at,
        }),
      ),
    },
  };
}

/** Arguments for public.create_session / public.save_session. */
export function sessionToRows(session: Session, ownerId: string) {
  return {
    session: {
      id: session.id,
      experience_id: session.experienceId,
      owner_id: ownerId,
      join_code: session.joinCode,
      status: session.status,
      current_position: session.currentPosition,
      score: session.score,
      started_at: session.startedAt,
      completed_at: session.completedAt,
      last_activity_at: session.lastActivityAt,
    },
    stops: session.stops.map((s) => ({
      stop_id: s.stopId,
      status: s.status,
      used_backup_venue: s.usedBackupVenue,
      check_in_method: s.checkInMethod,
      resolution: s.resolution,
      revealed_hint_levels: s.revealedHintLevels,
      wrong_attempts: s.wrongAttempts,
      consecutive_wrong: s.consecutiveWrong,
      cooldown_until: s.cooldownUntil,
      arrived_at: s.arrivedAt,
      completed_at: s.completedAt,
    })),
  };
}

/** Columns to select for sessionFromRow (sessions + its stop rows). */
export const SESSION_SELECT =
  "id, experience_id, owner_id, join_code, status, current_position, score, started_at, completed_at, last_activity_at, version, session_stops(stop_id, status, used_backup_venue, check_in_method, resolution, revealed_hint_levels, wrong_attempts, consecutive_wrong, cooldown_until, arrived_at, completed_at)";
