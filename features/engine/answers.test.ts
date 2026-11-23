import { describe, expect, it } from "vitest";
import { editDistance, isAcceptedTextAnswer, normaliseAnswer } from "./answers";

describe("normaliseAnswer (GAME_RULES §6)", () => {
  it.each([
    ["  Rosário ", "rosario"],
    ["ROSÁRIO", "rosario"],
    ["São Bento", "sao bento"],
    ["São-Bento!", "sao bento"],
    ["Clérigos   tower", "clerigos tower"],
    ["d'Ouro", "douro"],
    ["Café, à noite.", "cafe a noite"],
    ["Ç ã õ ê", "c a o e"],
  ])("normalises %j → %j", (input, expected) => {
    expect(normaliseAnswer(input)).toBe(expected);
  });

  it.each([
    ["The Boatmen", "boatmen"],
    ["o Porto", "porto"],
    ["A Brasileira", "brasileira"],
    ["Os Lusíadas", "lusiadas"],
    ["as pontes", "pontes"],
  ])("drops one leading article: %j → %j", (input, expected) => {
    expect(normaliseAnswer(input)).toBe(expected);
  });

  it("only drops the article at the start, and only one", () => {
    expect(normaliseAnswer("Rua da Sé")).toBe("rua da se");
    expect(normaliseAnswer("the the end")).toBe("the end");
  });

  it("keeps a lone article so a one-word answer is never emptied", () => {
    expect(normaliseAnswer("A")).toBe("a");
    expect(normaliseAnswer("the")).toBe("the");
  });

  it("returns empty for punctuation-only input", () => {
    expect(normaliseAnswer(" ?!… ")).toBe("");
  });
});

describe("editDistance", () => {
  it.each([
    ["rosario", "rosario", 0],
    ["rosario", "rosaro", 1],
    ["rosario", "rozario", 1],
    ["rosario", "rosarioo", 1],
    ["rosario", "orsario", 2],
    ["", "abc", 3],
  ])("%j vs %j = %i", (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });
});

describe("isAcceptedTextAnswer", () => {
  it("accepts exact matches after normalisation", () => {
    expect(isAcceptedTextAnswer("rosario", ["Rosário"], false)).toBe(true);
    expect(isAcceptedTextAnswer("  THE Boatmen ", ["boatmen"], false)).toBe(true);
  });

  it("accepts any of several accepted answers", () => {
    expect(isAcceptedTextAnswer("sete", ["7", "seven", "sete"], false)).toBe(true);
    expect(isAcceptedTextAnswer("7", ["7", "seven", "sete"], false)).toBe(true);
  });

  it("accepts one typo for 5+ character answers when allowFuzzy is on", () => {
    expect(isAcceptedTextAnswer("Rosaro", ["Rosário"], true)).toBe(true);
    expect(isAcceptedTextAnswer("Rozario", ["Rosário"], true)).toBe(true);
  });

  it("rejects typos when allowFuzzy is off", () => {
    expect(isAcceptedTextAnswer("Rosaro", ["Rosário"], false)).toBe(false);
  });

  it("rejects two typos even when fuzzy", () => {
    expect(isAcceptedTextAnswer("Rozaro", ["Rosário"], true)).toBe(false);
  });

  it("never fuzzy-matches answers shorter than 5 characters", () => {
    expect(isAcceptedTextAnswer("azil", ["azul"], true)).toBe(false);
    expect(isAcceptedTextAnswer("sevn", ["seven"], true)).toBe(true); // 5 chars: fuzzy applies
  });

  it("never fuzzy-matches numeric answers, whatever allowFuzzy says", () => {
    expect(isAcceptedTextAnswer("1879", ["1878"], true)).toBe(false);
    expect(isAcceptedTextAnswer("18789", ["1878"], true)).toBe(false);
    expect(isAcceptedTextAnswer("1878", ["1878"], true)).toBe(true);
    expect(isAcceptedTextAnswer("in 1879", ["in 1878"], true)).toBe(false);
  });

  it("rejects empty or punctuation-only input", () => {
    expect(isAcceptedTextAnswer("", ["7"], true)).toBe(false);
    expect(isAcceptedTextAnswer("   ", ["7"], true)).toBe(false);
    expect(isAcceptedTextAnswer("!!", ["7"], true)).toBe(false);
  });
});
