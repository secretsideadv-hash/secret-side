import type { AnswerKey } from "./types";
import { RULES } from "./rules";

/** GAME_RULES §6: leading articles dropped before comparing (English + Portuguese). */
const LEADING_ARTICLES = new Set(["the", "o", "a", "os", "as"]);

/**
 * Normalise free-text input for comparison (GAME_RULES §6):
 * lowercase, strip accents, drop punctuation, collapse spaces, drop one leading
 * article. Apostrophes vanish ("d'Ouro" → "douro"); other punctuation becomes a
 * space ("São-Bento" → "sao bento"). A lone article is kept so the result is never empty
 * for non-empty input.
 */
export function normaliseAnswer(input: string): string {
  const words = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // combining accents
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length > 1 && LEADING_ARTICLES.has(words[0]!)) words.shift();
  return words.join(" ");
}

/** Levenshtein distance with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length]!;
}

const HAS_DIGIT = /\p{N}/u;

/**
 * GAME_RULES §6: exact match after normalisation; if `allowFuzzy`, also edit
 * distance ≤ 1 for accepted answers of 5+ characters. Numeric answers (any digit)
 * are always exact-only.
 */
export function isAcceptedTextAnswer(
  input: string,
  acceptedAnswers: readonly string[],
  allowFuzzy: boolean,
): boolean {
  const given = normaliseAnswer(input);
  if (given === "") return false;

  return acceptedAnswers.some((raw) => {
    const accepted = normaliseAnswer(raw);
    if (given === accepted) return true;
    if (!allowFuzzy || HAS_DIGIT.test(accepted) || HAS_DIGIT.test(given)) return false;
    if (accepted.length < RULES.fuzzyMinLength) return false;
    return editDistance(given, accepted, RULES.fuzzyMaxDistance) <= RULES.fuzzyMaxDistance;
  });
}

export function isCorrectOption(key: AnswerKey & { type: "multiple_choice" }, optionId: string) {
  return key.correctOptionId === optionId;
}
