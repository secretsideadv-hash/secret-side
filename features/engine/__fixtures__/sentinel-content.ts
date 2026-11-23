import type { AnswerInput, Challenge, ExperienceContent, Hint, Stop } from "../types";

/**
 * Test content where every field is a unique, greppable sentinel, so leak tests
 * can search the serialised client state for strings that must never appear.
 * Odd positions are multiple choice (correct = option 3), even are text.
 */
export const STOP_COUNT = 5;
export const EXPERIENCE_ID = "exp-sentinel";

export const stopId = (i: number) => `stopid-${i}-zq`;
export const challengeId = (i: number) => `chalid-${i}-zq`;
export const optionId = (i: number, k: number) => `optid-${i}-${k}-zq`;
export const correctOptionId = (i: number) => optionId(i, 3);
export const textAnswer = (i: number) => `Answerword${i}zq`;
export const isMultipleChoice = (i: number) => i % 2 === 1;

export function buildSentinelContent(): ExperienceContent {
  const positions = Array.from({ length: STOP_COUNT }, (_, n) => n + 1);

  const stops: Stop[] = positions.map((i) => ({
    id: stopId(i),
    experienceId: EXPERIENCE_ID,
    position: i,
    title: `TITLE_${i}_ZQ`,
    teaser: `TEASER_${i}_ZQ`,
    story: `STORY_${i}_ZQ`,
    venueName: `VENUE_${i}_ZQ`,
    lat: 40 + i * 0.12345,
    lng: -8 - i * 0.54321,
    checkInRadiusM: 75,
    opensAt: null,
    closesAt: null,
    backupVenue:
      i === 4
        ? { name: "BACKUPVENUE_4_ZQ", lat: 39.98765, lng: -7.98765, teaser: "BACKUPTEASER_4_ZQ" }
        : null,
  }));

  const challenges: Challenge[] = positions.map((i) =>
    isMultipleChoice(i)
      ? {
          id: challengeId(i),
          stopId: stopId(i),
          type: "multiple_choice",
          prompt: `PROMPT_${i}_ZQ`,
          explanation: `EXPLAIN_${i}_ZQ`,
          options: [1, 2, 3, 4].map((k) => ({
            id: optionId(i, k),
            challengeId: challengeId(i),
            label: `OPTLABEL_${i}_${k}_ZQ`,
            position: k,
          })),
        }
      : {
          id: challengeId(i),
          stopId: stopId(i),
          type: "text",
          prompt: `PROMPT_${i}_ZQ`,
          explanation: `EXPLAIN_${i}_ZQ`,
          placeholder: null,
        },
  );

  const hints: Hint[] = positions.flatMap((i) =>
    ([1, 2] as const).map((level) => ({
      id: `hintid-${i}-${level}-zq`,
      challengeId: challengeId(i),
      level,
      text: `HINTTEXT_${i}_${level}_ZQ`,
    })),
  );

  return {
    experience: {
      id: EXPERIENCE_ID,
      slug: "sentinel",
      citySlug: "porto",
      kind: "mystery_walk",
      title: "Sentinel",
      tagline: "Test fixture",
      description: "Test fixture",
      isFlagship: false,
      durationMinutes: 60,
      distanceMeters: 1000,
      walkingDifficulty: "easy",
      nightNotes: null,
      recommendedStartFrom: null,
      recommendedStartTo: null,
      priceCents: 0,
      currency: "EUR",
      status: "published",
    },
    stops,
    challenges,
    hints,
    answerKeys: positions.map((i) =>
      isMultipleChoice(i)
        ? { challengeId: challengeId(i), type: "multiple_choice", correctOptionId: correctOptionId(i) }
        : {
            challengeId: challengeId(i),
            type: "text",
            acceptedAnswers: [textAnswer(i)],
            allowFuzzy: false,
          },
    ),
  };
}

export function correctAnswerFor(i: number): AnswerInput {
  return isMultipleChoice(i)
    ? { type: "multiple_choice", optionId: correctOptionId(i) }
    : { type: "text", text: textAnswer(i) };
}

export function wrongAnswerFor(i: number): AnswerInput {
  return isMultipleChoice(i)
    ? { type: "multiple_choice", optionId: optionId(i, 1) }
    : { type: "text", text: "definitely wrong" };
}
