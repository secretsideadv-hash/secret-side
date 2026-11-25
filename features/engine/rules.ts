/** Tunable numbers from docs/GAME_RULES.md. Change the doc first. */
export const RULES = {
  /** §5 */
  defaultCheckInRadiusM: 75,
  minCheckInRadiusM: 50,
  maxCheckInRadiusM: 150,
  /** §5 GPS check-in: accept if distance − min(accuracy, cap) ≤ radius. */
  gpsAccuracyAllowanceCapM: 35,
  gpsMaxAccuracyM: 100,
  gpsMaxFixAgeMs: 60_000,
  /** Fix age is measured on the phone; allow a little jitter below zero. */
  gpsFixFutureToleranceMs: 5_000,
  gpsDistanceRoundingM: 10,
  /** Client: offer manual check-in when there's no usable fix after this long. */
  gpsManualAfterMs: 20_000,
  /** §6 */
  fuzzyMinLength: 5,
  fuzzyMaxDistance: 1,
  cooldownAfterConsecutiveWrong: 5,
  cooldownMs: 3_000,
  /** §7 */
  hint2AfterWrongAttempts: 2,
  pointsPerStop: 100,
  hintPenalty: 15,
  revealOrSkipPenalty: 50,
  /** §2 */
  abandonAfterMs: 48 * 60 * 60 * 1000,
} as const;
