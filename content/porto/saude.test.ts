/**
 * Saúde! content: passes the content validator (the same check the import
 * runs), plus a leak check on the real content.
 */
import { describe, expect, it } from "vitest";
import { validateContent } from "@/features/content/validate";
import { checkIn, skipStop, startSession } from "@/features/engine/session";
import { toVisibleState } from "@/features/engine/visible-state";
import { portoExperiences } from "./index";
import { saude } from "./saude";

describe("Saúde! content", () => {
  const { experience, stops, challenges, hints, answerKeys } = saude;

  it("is the published flagship with slug saude and 5 stops", () => {
    expect(experience).toMatchObject({ slug: "saude", title: "Saúde!", isFlagship: true, status: "published" });
    expect(stops).toHaveLength(5);
    expect(portoExperiences).toContain(saude);
  });

  it("passes the content validator with no errors or warnings", () => {
    expect(validateContent(saude)).toEqual({ errors: [], warnings: [] });
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
