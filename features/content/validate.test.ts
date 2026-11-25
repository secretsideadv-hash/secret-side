import { describe, expect, it } from "vitest";
import { saude } from "@/content/porto/saude";
import type { ExperienceContent } from "@/features/engine/types";
import { validateContent } from "./validate";

/** A deep copy of Saúde! with one thing broken. */
function broken(change: (c: ExperienceContent) => void): ExperienceContent {
  const copy = structuredClone(saude) as ExperienceContent;
  change(copy);
  return copy;
}

const messages = (c: ExperienceContent) => validateContent(c).errors.map((e) => `${e.path}: ${e.message}`);

describe("validateContent", () => {
  it("accepts Saúde!", () => {
    expect(validateContent(saude).errors).toEqual([]);
  });

  it.each([
    ["a non-UUID id", (c: ExperienceContent) => void (c.stops[0]!.id = "stop-1"), /not a UUID/],
    ["a duplicated id", (c: ExperienceContent) => void (c.hints[1]!.id = c.hints[0]!.id), /duplicates the id/],
    ["a gap in stop positions", (c: ExperienceContent) => void (c.stops[4]!.position = 7), /positions must be 1\.\.5/],
    ["a radius outside 50–150 m", (c: ExperienceContent) => void (c.stops[0]!.checkInRadiusM = 300), /checkInRadiusM/],
    ["a story that's too short", (c: ExperienceContent) => void (c.stops[0]!.story = "Too short."), /50–120 words/],
    ["a stop outside the play area", (c: ExperienceContent) => void (c.stops[0]!.lat = 38.72), /outside the Porto/],
    ["half an opening window", (c: ExperienceContent) => void (c.stops[0]!.closesAt = null), /set both or neither/],
    ["a bad time", (c: ExperienceContent) => void (c.stops[0]!.opensAt = "25:00"), /must be HH:MM/],
    [
      "a stop without a challenge",
      (c: ExperienceContent) => void (c.challenges = c.challenges.filter((x) => x.stopId !== c.stops[0]!.id)),
      /needs exactly one challenge/,
    ],
    [
      "a missing answer key",
      (c: ExperienceContent) => void (c.answerKeys = c.answerKeys.slice(1)),
      /needs exactly one answer key/,
    ],
    [
      "a correct option that isn't an option",
      (c: ExperienceContent) => {
        const key = c.answerKeys.find((k) => k.type === "multiple_choice")!;
        if (key.type === "multiple_choice") key.correctOptionId = "00000000-0000-4000-8000-000000000000";
      },
      /correct option isn't one of its options/,
    ],
    [
      "two options that read the same",
      (c: ExperienceContent) => {
        const mc = c.challenges.find((x) => x.type === "multiple_choice")!;
        if (mc.type === "multiple_choice") mc.options[1]!.label = ` ${mc.options[0]!.label.toUpperCase()} `;
      },
      /read the same/,
    ],
    [
      "fuzzy matching on a numeric answer",
      (c: ExperienceContent) => {
        const key = c.answerKeys.find((k) => k.type === "text" && k.acceptedAnswers.some((a) => /\d/.test(a)))!;
        if (key.type === "text") key.allowFuzzy = true;
      },
      /never fuzzy-matched/,
    ],
    [
      "an empty accepted answer",
      (c: ExperienceContent) => {
        const key = c.answerKeys.find((k) => k.type === "text")!;
        if (key.type === "text") key.acceptedAnswers = ["  ?! "];
      },
      /empty after normalisation/,
    ],
    ["a missing hint 2", (c: ExperienceContent) => void (c.hints = c.hints.filter((h, i) => i !== 1)), /levels 1 and 2/],
    ["the internal codename", (c: ExperienceContent) => void (c.experience.tagline += " ROAM"), /codename/],
  ])("rejects %s", (_name, change, expected) => {
    const errors = messages(broken(change));
    expect(errors.some((m) => expected.test(m)), errors.join("\n")).toBe(true);
  });

  it("warns, without blocking, when an article would be dropped from an answer", () => {
    const content = broken((c) => {
      const key = c.answerKeys.find((k) => k.type === "text")!;
      if (key.type === "text") key.acceptedAnswers.push("A Brasileira");
    });
    const { errors, warnings } = validateContent(content);
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.message).join("\n")).toMatch(/without "a"/);
  });
});
