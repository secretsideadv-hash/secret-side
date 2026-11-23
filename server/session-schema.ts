import "server-only";

import { z } from "zod";
import type { Session } from "@/features/engine/types";

/**
 * Shape check for a decrypted session. Encryption already stops tampering; this
 * guards against stale cookie formats after a deploy changes the Session type.
 */
const sessionStopSchema = z.object({
  stopId: z.string(),
  status: z.enum(["locked", "unlocked", "arrived", "solved", "skipped"]),
  usedBackupVenue: z.boolean(),
  checkInMethod: z.enum(["gps", "manual"]).nullable(),
  resolution: z.enum(["answered", "revealed", "skipped"]).nullable(),
  revealedHintLevels: z.array(z.union([z.literal(1), z.literal(2)])),
  wrongAttempts: z.number().int().nonnegative(),
  consecutiveWrong: z.number().int().nonnegative(),
  cooldownUntil: z.string().nullable(),
  arrivedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export const sessionSchema = z.object({
  id: z.string(),
  experienceId: z.string(),
  ownerId: z.string().nullable(),
  joinCode: z.string().nullable(),
  status: z.enum(["not_started", "in_progress", "completed", "abandoned"]),
  currentPosition: z.number().int().positive(),
  score: z.number().int().nonnegative(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  lastActivityAt: z.string(),
  stops: z.array(sessionStopSchema),
}) satisfies z.ZodType<Session>;
