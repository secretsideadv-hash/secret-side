/**
 * Content validator: everything an experience must satisfy before it can be
 * imported (GAME_RULES §5–§7, §10 and the copy rules in CLAUDE.md).
 * Pure: no I/O. Errors block an import; warnings are printed for the author.
 */
import { normaliseAnswer } from "../engine/answers";
import { RULES } from "../engine/rules";
import type { ExperienceContent } from "../engine/types";

export interface ContentIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  errors: ContentIssue[];
  warnings: ContentIssue[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9-]{1,64}$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STORY_WORDS = { min: 50, max: 120 };
const ARTICLES = new Set(["the", "o", "a", "os", "as"]);

/** Play areas per city: stops (and backup venues) must lie inside. */
const CITY_BOUNDS: Record<string, { name: string; lat: [number, number]; lng: [number, number] }> = {
  porto: { name: "the Porto historic centre", lat: [41.138, 41.152], lng: [-8.625, -8.605] },
};

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Leading article that normalisation would drop ("A Brasileira" → "brasileira"). */
function droppedArticle(answer: string): string | null {
  const words = answer.trim().toLowerCase().split(/\s+/);
  return words.length > 1 && ARTICLES.has(words[0]!) ? words[0]! : null;
}

export function validateContent(content: ExperienceContent): ValidationResult {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const error = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  const { experience: exp, stops, challenges, hints, answerKeys } = content;

  // --- Experience -----------------------------------------------------------
  if (!SLUG.test(exp.slug)) error("experience.slug", `"${exp.slug}" must be lowercase letters, digits and dashes`);
  if (!exp.title.trim()) error("experience.title", "is empty");
  if (exp.durationMinutes <= 0) error("experience.durationMinutes", "must be positive");
  if (exp.distanceMeters < 0) error("experience.distanceMeters", "can't be negative");
  if (!Number.isInteger(exp.priceCents) || exp.priceCents < 0) error("experience.priceCents", "must be a whole number ≥ 0");
  if ((exp.recommendedStartFrom === null) !== (exp.recommendedStartTo === null)) {
    error("experience.recommendedStart", "set both start-window times or neither");
  }
  for (const [key, value] of [
    ["recommendedStartFrom", exp.recommendedStartFrom],
    ["recommendedStartTo", exp.recommendedStartTo],
  ] as const) {
    if (value !== null && !LOCAL_TIME.test(value)) error(`experience.${key}`, `"${value}" must be HH:MM`);
  }
  if (exp.kind === "pub_crawl" && !exp.nightNotes) {
    warn("experience.nightNotes", "a pub crawl should state night-time conditions up front");
  }

  // --- IDs ------------------------------------------------------------------
  const allIds: [string, string][] = [
    ["experience.id", exp.id],
    ...stops.map((s, i): [string, string] => [`stops[${i}].id`, s.id]),
    ...challenges.map((c, i): [string, string] => [`challenges[${i}].id`, c.id]),
    ...challenges.flatMap((c, i) =>
      c.type === "multiple_choice"
        ? c.options.map((o, j): [string, string] => [`challenges[${i}].options[${j}].id`, o.id])
        : [],
    ),
    ...hints.map((h, i): [string, string] => [`hints[${i}].id`, h.id]),
  ];
  const seen = new Map<string, string>();
  for (const [path, id] of allIds) {
    if (!UUID.test(id)) error(path, `"${id}" is not a UUID`);
    const first = seen.get(id);
    if (first) error(path, `duplicates the id of ${first}`);
    else seen.set(id, path);
  }

  // --- Stops ----------------------------------------------------------------
  if (stops.length === 0) error("stops", "an experience needs at least one stop");
  const positions = stops.map((s) => s.position).sort((a, b) => a - b);
  if (positions.some((p, i) => p !== i + 1)) {
    error("stops", `positions must be 1..${stops.length} with no gaps or repeats (got ${positions.join(", ")})`);
  }
  const bounds = CITY_BOUNDS[exp.citySlug];
  if (!bounds) warn("experience.citySlug", `no play area defined for "${exp.citySlug}"; coordinates not checked`);
  const inBounds = (lat: number, lng: number) =>
    !bounds || (lat > bounds.lat[0] && lat < bounds.lat[1] && lng > bounds.lng[0] && lng < bounds.lng[1]);

  stops.forEach((stop, i) => {
    const at = `stops[${i}] (${stop.title || `position ${stop.position}`})`;
    if (stop.experienceId !== exp.id) error(at, "belongs to a different experience id");
    for (const field of ["title", "teaser", "story", "venueName"] as const) {
      if (!stop[field].trim()) error(`${at}.${field}`, "is empty");
    }
    if (stop.checkInRadiusM < RULES.minCheckInRadiusM || stop.checkInRadiusM > RULES.maxCheckInRadiusM) {
      error(`${at}.checkInRadiusM`, `must be ${RULES.minCheckInRadiusM}–${RULES.maxCheckInRadiusM} m (got ${stop.checkInRadiusM})`);
    }
    const words = wordCount(stop.story);
    if (words < STORY_WORDS.min || words > STORY_WORDS.max) {
      error(`${at}.story`, `must be ${STORY_WORDS.min}–${STORY_WORDS.max} words (got ${words})`);
    }
    if (!inBounds(stop.lat, stop.lng)) error(`${at}.lat/lng`, `is outside ${bounds!.name}`);
    if ((stop.opensAt === null) !== (stop.closesAt === null)) error(`${at}.opensAt/closesAt`, "set both or neither");
    for (const field of ["opensAt", "closesAt"] as const) {
      const value = stop[field];
      if (value !== null && !LOCAL_TIME.test(value)) error(`${at}.${field}`, `"${value}" must be HH:MM`);
    }
    if (stop.backupVenue) {
      const b = stop.backupVenue;
      if (!b.name.trim() || !b.teaser.trim()) error(`${at}.backupVenue`, "needs a name and a teaser");
      if (!inBounds(b.lat, b.lng)) error(`${at}.backupVenue`, `is outside ${bounds!.name}`);
    }

    const own = challenges.filter((c) => c.stopId === stop.id);
    if (own.length !== 1) error(at, `needs exactly one challenge (has ${own.length})`);
  });

  // --- Challenges, answer keys and hints -------------------------------------
  const stopIds = new Set(stops.map((s) => s.id));
  challenges.forEach((challenge, i) => {
    const at = `challenges[${i}]`;
    if (!stopIds.has(challenge.stopId)) error(at, "points at a stop that isn't in this experience");
    if (!challenge.prompt.trim()) error(`${at}.prompt`, "is empty");

    const keys = answerKeys.filter((k) => k.challengeId === challenge.id);
    const key = keys[0];
    if (keys.length !== 1) error(at, `needs exactly one answer key (has ${keys.length})`);
    else if (key!.type !== challenge.type) error(at, `answer key is ${key!.type}, challenge is ${challenge.type}`);

    if (challenge.type === "multiple_choice") {
      if (challenge.options.length < 2) error(`${at}.options`, "needs at least 2 options");
      challenge.options.forEach((o, j) => {
        if (o.challengeId !== challenge.id) error(`${at}.options[${j}]`, "belongs to a different challenge");
        if (!normaliseAnswer(o.label)) error(`${at}.options[${j}].label`, "is empty");
      });
      const optionPositions = challenge.options.map((o) => o.position);
      if (new Set(optionPositions).size !== optionPositions.length) error(`${at}.options`, "positions repeat");
      const labels = challenge.options.map((o) => normaliseAnswer(o.label));
      if (new Set(labels).size !== labels.length) {
        error(`${at}.options`, "two options read the same once accents, case and articles are ignored");
      }
      if (key?.type === "multiple_choice" && !challenge.options.some((o) => o.id === key.correctOptionId)) {
        error(`${at}`, "the correct option isn't one of its options");
      }
    } else if (key?.type === "text") {
      if (key.acceptedAnswers.length === 0) error(`${at}.acceptedAnswers`, "needs at least one accepted answer");
      const normalised = key.acceptedAnswers.map((a) => normaliseAnswer(a));
      key.acceptedAnswers.forEach((answer, j) => {
        if (!normalised[j]) error(`${at}.acceptedAnswers[${j}]`, "is empty after normalisation");
        const article = droppedArticle(answer);
        if (article) {
          warn(`${at}.acceptedAnswers[${j}]`, `"${answer}" is matched without "${article}" (GAME_RULES §6); check that's intended`);
        }
      });
      if (new Set(normalised).size !== normalised.length) {
        warn(`${at}.acceptedAnswers`, "some accepted answers are identical after normalisation");
      }
      if (key.allowFuzzy && normalised.some((a) => /\d/.test(a))) {
        error(`${at}.allowFuzzy`, "numeric answers are never fuzzy-matched; set allowFuzzy to false");
      }
    }

    const levels = hints
      .filter((h) => h.challengeId === challenge.id)
      .map((h) => h.level)
      .sort();
    if (levels.join(",") !== "1,2") error(`${at}`, `needs hints at levels 1 and 2 (has ${levels.join(", ") || "none"})`);
  });

  const challengeIds = new Set(challenges.map((c) => c.id));
  answerKeys.forEach((k, i) => {
    if (!challengeIds.has(k.challengeId)) error(`answerKeys[${i}]`, "belongs to no challenge in this experience");
  });
  hints.forEach((h, i) => {
    if (!challengeIds.has(h.challengeId)) error(`hints[${i}]`, "belongs to no challenge in this experience");
    if (!h.text.trim()) error(`hints[${i}].text`, "is empty");
  });

  // --- Copy -----------------------------------------------------------------
  if (/\broam\b/i.test(JSON.stringify(content))) {
    error("content", 'uses the internal codename "ROAM", which must never appear in copy');
  }

  return { errors, warnings };
}
