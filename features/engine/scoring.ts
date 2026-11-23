import type { Resolution } from "./types";
import { RULES } from "./rules";

/** GAME_RULES §7: 100 per stop, −15 per hint, −50 for a reveal or skip. Never below 0. */
export function stopScore(resolution: Resolution, hintsUsed: number): number {
  const penalty =
    hintsUsed * RULES.hintPenalty + (resolution === "answered" ? 0 : RULES.revealOrSkipPenalty);
  return Math.max(0, RULES.pointsPerStop - penalty);
}
