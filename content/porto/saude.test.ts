/**
 * Content integrity for Saúde! (an early version of the M5 validator), plus a
 * leak check on the real content.
 */
import { describe, expect, it } from "vitest";
import { normaliseAnswer } from "@/features/engine/answers";
import { RULES } from "@/features/engine/rules";
import { checkIn, skipStop, startSession } from "@/features/engine/session";
import { toVisibleState } from "@/features/engine/visible-state";
import { createFileContentRepository } from "@/server/content-repository";
import { portoExperiences } from "./index";
import { saude } from "./saude";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const wordCount = (text: string) => text.trim().split(/\s+/).length;

describe("Saúde! content", () => {
  const { experience, stops, challenges, hints, answerKeys } = saude;

  it("is the published flagship with slug saude", () => {
    expect(experience).toMatchObject({ slug: "saude", title: "Saúde!", isFlagship: true, status: "published" });
    expect(portoExperiences).toContain(saude);
  });

  it("never uses the internal codename", () => {
    expect(JSON.stringify(saude).toLowerCase()).not.toMatch(/\broam\b/);
  });

  it("has 5 stops at positions 1–5 with valid radius and story length", () => {
    expect(stops.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
    for (const stop of stops) {
      expect(stop.experienceId).toBe(experience.id);
      expect(stop.checkInRadiusM).toBeGreaterThanOrEqual(RULES.minCheckInRadiusM);
      expect(stop.checkInRadiusM).toBeLessThanOrEqual(RULES.maxCheckInRadiusM);
      const words = wordCount(stop.story);
      expect(words, `${stop.title}: ${words} words`).toBeGreaterThanOrEqual(50);
      expect(words, `${stop.title}: ${words} words`).toBeLessThanOrEqual(120);
    }
  });

  it("keeps every stop inside the Porto historic centre", () => {
    for (const stop of stops) {
      expect(stop.lat).toBeGreaterThan(41.138);
      expect(stop.lat).toBeLessThan(41.152);
      expect(stop.lng).toBeGreaterThan(-8.625);
      expect(stop.lng).toBeLessThan(-8.605);
    }
  });

  it("uses unique UUIDs everywhere", () => {
    const ids = [
      experience.id,
      ...stops.map((s) => s.id),
      ...challenges.map((c) => c.id),
      ...challenges.flatMap((c) => (c.type === "multiple_choice" ? c.options.map((o) => o.id) : [])),
      ...hints.map((h) => h.id),
    ];
    for (const id of ids) expect(id).toMatch(UUID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every stop one challenge, an answer key of the same type and hints 1 and 2", () => {
    for (const stop of stops) {
      const own = challenges.filter((c) => c.stopId === stop.id);
      expect(own).toHaveLength(1);
      const challenge = own[0]!;
      const key = answerKeys.find((k) => k.challengeId === challenge.id);
      expect(key?.type).toBe(challenge.type);
      expect(
        hints.filter((h) => h.challengeId === challenge.id).map((h) => h.level).sort(),
      ).toEqual([1, 2]);
    }
  });

  it("multiple choice: correct option exists, 2+ options, none normalise to the same text", () => {
    for (const challenge of challenges) {
      if (challenge.type !== "multiple_choice") continue;
      const key = answerKeys.find((k) => k.challengeId === challenge.id);
      expect(key?.type === "multiple_choice" && challenge.options.some((o) => o.id === key.correctOptionId)).toBe(true);
      expect(challenge.options.length).toBeGreaterThanOrEqual(2);
      const labels = challenge.options.map((o) => normaliseAnswer(o.label));
      expect(new Set(labels).size).toBe(labels.length);
      for (const o of challenge.options) expect(o.challengeId).toBe(challenge.id);
    }
  });

  it("text answers: non-empty, and numeric answers never allow fuzzy matching", () => {
    for (const key of answerKeys) {
      if (key.type !== "text") continue;
      expect(key.acceptedAnswers.length).toBeGreaterThan(0);
      for (const a of key.acceptedAnswers) expect(normaliseAnswer(a)).not.toBe("");
      if (key.acceptedAnswers.some((a) => /\d/.test(a))) expect(key.allowFuzzy).toBe(false);
    }
  });

  it("never leaks locked stops, answers or unrevealed hints while skipping through", () => {
    let s = startSession({ id: "content-leak", content: saude, now: new Date() });
    const answerTexts = answerKeys.flatMap((k) => (k.type === "text" ? k.acceptedAnswers : []));
    for (const stop of stops) {
      s = checkIn(s, saude, { stopId: stop.id, method: "manual", now: new Date() });
      const json = JSON.stringify(toVisibleState(s, saude, new Date()));
      for (const locked of stops.filter((x) => x.position > stop.position)) {
        expect(json).not.toContain(locked.id);
        expect(json).not.toContain(locked.title);
        expect(json).not.toContain(locked.story);
      }
      for (const hint of hints) expect(json).not.toContain(hint.text);
      expect(json).not.toMatch(/correctOptionId|acceptedAnswers|allowFuzzy/);
      // Text answers may legitimately appear inside the visible story ("Rosário"),
      // so only check answers that aren't part of what the player can already read.
      const visibleText = `${stop.story} ${challenges.find((c) => c.stopId === stop.id)!.prompt}`;
      for (const answer of answerTexts) {
        if (!visibleText.includes(answer)) expect(json).not.toContain(`"${answer}"`);
      }
      s = skipStop(s, saude, { stopId: stop.id, now: new Date() });
    }
    expect(s.status).toBe("completed");
  });
});

describe("file content repository", () => {
  const repo = createFileContentRepository();

  it("lists Saúde! for Porto with its stop count", async () => {
    const list = await repo.listPublished("porto");
    expect(list.map((x) => x.experience.slug)).toContain("saude");
    expect(list.find((x) => x.experience.slug === "saude")?.stopCount).toBe(5);
  });

  it("summaries contain no stops, challenges, hints or answers", async () => {
    const summary = await repo.getSummaryBySlug("saude");
    expect(Object.keys(summary!).sort()).toEqual(["experience", "stopCount"]);
    expect(JSON.stringify(summary)).not.toContain(saude.stops[0]!.id);
  });

  it("returns null for unknown slugs", async () => {
    expect(await repo.getSummaryBySlug("nope")).toBeNull();
  });
});
