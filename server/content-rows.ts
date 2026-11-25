/**
 * Engine content (camelCase) ⇄ database rows (snake_case). The one place that
 * knows both shapes: the import script writes `toRows()`, the Supabase content
 * repository reads through `fromRows()`, which also validates what comes back.
 *
 * No `server-only` here so the import script and unit tests can use it; it only
 * reshapes data. Content still reaches the browser only via toVisibleState().
 */
import { z } from "zod";
import type {
  AnswerKey,
  Challenge,
  ChallengeOption,
  Experience,
  ExperienceContent,
  Hint,
  LocalTime,
  Stop,
} from "@/features/engine/types";

// ---------------------------------------------------------------------------
// Row schemas (what get_experience_content returns; extra columns are dropped)
// ---------------------------------------------------------------------------

const uuid = z.uuid();
const time = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/)
  .nullable();

export const experienceRowSchema = z.object({
  id: uuid,
  slug: z.string(),
  city_slug: z.literal("porto"),
  kind: z.enum(["pub_crawl", "mystery_walk", "food_quest", "hidden_gems"]),
  title: z.string(),
  tagline: z.string(),
  description: z.string(),
  is_flagship: z.boolean(),
  duration_minutes: z.number().int(),
  distance_meters: z.number().int(),
  walking_difficulty: z.enum(["easy", "moderate", "hilly"]),
  night_notes: z.string().nullable(),
  recommended_start_from: time,
  recommended_start_to: time,
  price_cents: z.number().int(),
  currency: z.literal("EUR"),
  status: z.enum(["draft", "published"]),
});

const stopRow = z.object({
  id: uuid,
  experience_id: uuid,
  position: z.number().int(),
  title: z.string(),
  teaser: z.string(),
  story: z.string(),
  venue_name: z.string(),
  lat: z.number(),
  lng: z.number(),
  check_in_radius_m: z.number().int(),
  opens_at: time,
  closes_at: time,
  backup_name: z.string().nullable(),
  backup_lat: z.number().nullable(),
  backup_lng: z.number().nullable(),
  backup_teaser: z.string().nullable(),
});

const challengeRow = z.object({
  id: uuid,
  stop_id: uuid,
  type: z.enum(["multiple_choice", "text"]),
  prompt: z.string(),
  explanation: z.string().nullable(),
  placeholder: z.string().nullable(),
});

const optionRow = z.object({ id: uuid, challenge_id: uuid, label: z.string(), position: z.number().int() });

const answerRow = z.object({
  challenge_id: uuid,
  type: z.enum(["multiple_choice", "text"]),
  correct_option_id: uuid.nullable(),
  accepted_answers: z.array(z.string()).nullable(),
  allow_fuzzy: z.boolean(),
});

const hintRow = z.object({ id: uuid, challenge_id: uuid, level: z.union([z.literal(1), z.literal(2)]), text: z.string() });

export const contentRowsSchema = z.object({
  experience: experienceRowSchema,
  stops: z.array(stopRow),
  challenges: z.array(challengeRow),
  options: z.array(optionRow),
  answers: z.array(answerRow),
  hints: z.array(hintRow),
});

export type ContentRows = z.infer<typeof contentRowsSchema>;
export type ExperienceRow = z.infer<typeof experienceRowSchema>;

// ---------------------------------------------------------------------------
// Rows → engine
// ---------------------------------------------------------------------------

/** Postgres `time` comes back as HH:MM:SS; the engine uses HH:MM. */
const toLocalTime = (value: string | null): LocalTime | null => (value === null ? null : value.slice(0, 5));

export function experienceFromRow(r: ExperienceRow): Experience {
  return {
    id: r.id,
    slug: r.slug,
    citySlug: r.city_slug,
    kind: r.kind,
    title: r.title,
    tagline: r.tagline,
    description: r.description,
    isFlagship: r.is_flagship,
    durationMinutes: r.duration_minutes,
    distanceMeters: r.distance_meters,
    walkingDifficulty: r.walking_difficulty,
    nightNotes: r.night_notes,
    recommendedStartFrom: toLocalTime(r.recommended_start_from),
    recommendedStartTo: toLocalTime(r.recommended_start_to),
    priceCents: r.price_cents,
    currency: r.currency,
    status: r.status,
  };
}

/** Validates raw rows (throws on anything unexpected) and builds engine content. */
export function fromRows(raw: unknown): ExperienceContent {
  const rows = contentRowsSchema.parse(raw);

  const stops: Stop[] = rows.stops
    .map((s) => ({
      id: s.id,
      experienceId: s.experience_id,
      position: s.position,
      title: s.title,
      teaser: s.teaser,
      story: s.story,
      venueName: s.venue_name,
      lat: s.lat,
      lng: s.lng,
      checkInRadiusM: s.check_in_radius_m,
      opensAt: toLocalTime(s.opens_at),
      closesAt: toLocalTime(s.closes_at),
      backupVenue:
        s.backup_name !== null && s.backup_lat !== null && s.backup_lng !== null && s.backup_teaser !== null
          ? { name: s.backup_name, lat: s.backup_lat, lng: s.backup_lng, teaser: s.backup_teaser }
          : null,
    }))
    .sort((a, b) => a.position - b.position);

  const challenges: Challenge[] = rows.challenges.map((c) => {
    const base = { id: c.id, stopId: c.stop_id, prompt: c.prompt, explanation: c.explanation };
    if (c.type === "text") return { ...base, type: "text", placeholder: c.placeholder };
    const options: ChallengeOption[] = rows.options
      .filter((o) => o.challenge_id === c.id)
      .map((o) => ({ id: o.id, challengeId: o.challenge_id, label: o.label, position: o.position }))
      .sort((a, b) => a.position - b.position);
    return { ...base, type: "multiple_choice", options };
  });

  const answerKeys: AnswerKey[] = rows.answers.map((a) => {
    if (a.type === "multiple_choice") {
      if (!a.correct_option_id) throw new Error(`Answer key ${a.challenge_id} has no correct option`);
      return { challengeId: a.challenge_id, type: "multiple_choice", correctOptionId: a.correct_option_id };
    }
    return {
      challengeId: a.challenge_id,
      type: "text",
      acceptedAnswers: a.accepted_answers ?? [],
      allowFuzzy: a.allow_fuzzy,
    };
  });

  const hints: Hint[] = rows.hints.map((h) => ({ id: h.id, challengeId: h.challenge_id, level: h.level, text: h.text }));

  return { experience: experienceFromRow(rows.experience), stops, challenges, hints, answerKeys };
}

// ---------------------------------------------------------------------------
// Engine → rows (the import payload)
// ---------------------------------------------------------------------------

export function toRows(content: ExperienceContent): ContentRows {
  const e = content.experience;
  return {
    experience: {
      id: e.id,
      slug: e.slug,
      city_slug: e.citySlug,
      kind: e.kind,
      title: e.title,
      tagline: e.tagline,
      description: e.description,
      is_flagship: e.isFlagship,
      duration_minutes: e.durationMinutes,
      distance_meters: e.distanceMeters,
      walking_difficulty: e.walkingDifficulty,
      night_notes: e.nightNotes,
      recommended_start_from: e.recommendedStartFrom,
      recommended_start_to: e.recommendedStartTo,
      price_cents: e.priceCents,
      currency: e.currency,
      status: e.status,
    },
    stops: content.stops.map((s) => ({
      id: s.id,
      experience_id: s.experienceId,
      position: s.position,
      title: s.title,
      teaser: s.teaser,
      story: s.story,
      venue_name: s.venueName,
      lat: s.lat,
      lng: s.lng,
      check_in_radius_m: s.checkInRadiusM,
      opens_at: s.opensAt,
      closes_at: s.closesAt,
      backup_name: s.backupVenue?.name ?? null,
      backup_lat: s.backupVenue?.lat ?? null,
      backup_lng: s.backupVenue?.lng ?? null,
      backup_teaser: s.backupVenue?.teaser ?? null,
    })),
    challenges: content.challenges.map((c) => ({
      id: c.id,
      stop_id: c.stopId,
      type: c.type,
      prompt: c.prompt,
      explanation: c.explanation,
      placeholder: c.type === "text" ? c.placeholder : null,
    })),
    options: content.challenges.flatMap((c) =>
      c.type === "multiple_choice"
        ? c.options.map((o) => ({ id: o.id, challenge_id: o.challengeId, label: o.label, position: o.position }))
        : [],
    ),
    answers: content.answerKeys.map((k) =>
      k.type === "multiple_choice"
        ? { challenge_id: k.challengeId, type: k.type, correct_option_id: k.correctOptionId, accepted_answers: null, allow_fuzzy: false }
        : { challenge_id: k.challengeId, type: k.type, correct_option_id: null, accepted_answers: k.acceptedAnswers, allow_fuzzy: k.allowFuzzy },
    ),
    hints: content.hints.map((h) => ({ id: h.id, challenge_id: h.challengeId, level: h.level, text: h.text })),
  };
}
