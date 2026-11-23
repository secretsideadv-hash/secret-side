import type { ExperienceKind, WalkingDifficulty } from "@/features/engine/types";

/** UI copy for enum values. Pure, safe for client and server. */

export const KIND_LABEL: Record<ExperienceKind, string> = {
  pub_crawl: "Mystery pub crawl",
  mystery_walk: "Mystery walk",
  food_quest: "Food quest",
  hidden_gems: "Hidden gems",
};

export const DIFFICULTY_LABEL: Record<WalkingDifficulty, string> = {
  easy: "Easy",
  moderate: "Moderate",
  hilly: "Hilly",
};

/** 150 → "2h 30m", 120 → "2h", 45 → "45m" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** 1900 → "1.9 km", 800 → "800 m" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace(/\.0$/, "")} km`;
}

/** 1500 → "€15", 1250 → "€12.50", 0 → "Free" */
export function formatPrice(cents: number, currency: "EUR"): string {
  if (cents === 0) return "Free";
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
