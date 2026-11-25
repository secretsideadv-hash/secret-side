import { expect, test, type Response } from "@playwright/test";
import {
  STOP1,
  STOP2_ANSWER,
  STOP4_WRONG,
  STOP5_RIGHT,
  STOP_TITLES,
  UNLOCKED_URL,
  checkAnswer,
  checkIn,
  deleteTestGuests,
  label,
  startAdventure,
  takeMeThere,
  text,
  watchCspViolations,
} from "./support";

/** Plays the whole mock Saúde! adventure through the UI, like a player would. */

const EXPECTED_SCORE = 355; // 85 (1 hint) + 100 + 50 (skip) + 20 (2 hints + reveal) + 100

test.afterAll(deleteTestGuests);

test("plays the whole adventure from Discover to the completion screen", async ({ page }) => {
  // Ten screens with a live WebGL map (software-rendered in headless Chromium).
  test.setTimeout(90_000);
  const cspViolations = watchCspViolations(page);
  await startAdventure(page);

  // Stop 1 (multiple choice): wrong answer, hint, then right answer.
  await expect(label(page, "Stop 1 of 5")).toHaveText("1/5");
  await expect(page.getByRole("heading", { name: "Head to your next stop" })).toBeVisible();
  await checkIn(page);
  await expect(text(page, `Stop 1 · ${STOP_TITLES[0]}`)).toBeVisible();
  await text(page, STOP1.wrong, true).click();
  await checkAnswer(page);
  await expect(text(page, "Not quite. Try again, or take a hint.")).toBeVisible();
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(text(page, "Hint 1:")).toBeVisible();
  await text(page, STOP1.right, true).click();
  await checkAnswer(page);

  // Unlocked screen for stop 2.
  await expect(page).toHaveURL(UNLOCKED_URL);
  await expect(text(page, "Correct!")).toBeVisible();
  await expect(text(page, "Stop 2 of 5 unlocked")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Destination unlocked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: STOP_TITLES[1] })).toBeVisible();
  const maps = page.getByRole("link", { name: /Open in Google Maps/ });
  await expect(maps).toHaveAttribute("href", /google\.com\/maps\/dir\/.*destination=41\.1428%2C-8\.611/);

  // Refreshing doesn't reveal later stops (M1 "done when").
  await page.reload();
  for (const title of STOP_TITLES.slice(2)) await expect(text(page, title)).toHaveCount(0);

  // Stop 2 (text): accent-free answer is accepted.
  await takeMeThere(page);
  await expect(label(page, "Stop 2 of 5")).toHaveText("2/5");
  await checkIn(page);
  await page.getByRole("textbox", { name: "Your answer" }).fill(STOP2_ANSWER);
  await checkAnswer(page);
  await expect(page).toHaveURL(UNLOCKED_URL);
  await expect(text(page, "Stop 3 of 5 unlocked")).toBeVisible();

  // Stop 3: skipped before arriving (always allowed).
  await takeMeThere(page);
  await page.getByRole("button", { name: "Stuck? Skip this stop" }).click();
  await page.getByRole("button", { name: "Skip stop" }).click();
  await expect(page).toHaveURL(UNLOCKED_URL);
  await expect(text(page, "Stop 3 skipped")).toBeVisible();
  await expect(text(page, "Stop 4 of 5 unlocked")).toBeVisible();

  // Stop 4 (numeric text): wrong, both hints, reveal the answer.
  await takeMeThere(page);
  await checkIn(page);
  await page.getByRole("textbox", { name: "Your answer" }).fill(STOP4_WRONG);
  await checkAnswer(page);
  await expect(text(page, "Not quite. Try again, or take a hint.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal answer" })).toHaveCount(0); // only after hint 2
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(text(page, "Hint 1:")).toBeVisible();
  await page.getByRole("button", { name: "Hint 2" }).click();
  await expect(text(page, "Hint 2:")).toBeVisible();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page).toHaveURL(UNLOCKED_URL);
  await expect(text(page, "The answer was: 7")).toBeVisible();

  // Stop 5 (multiple choice): right answer finishes the adventure.
  await takeMeThere(page);
  await checkIn(page);
  await text(page, STOP5_RIGHT, true).click();
  await checkAnswer(page);

  await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}\/complete$/);
  await expect(text(page, "Adventure complete")).toBeVisible();
  await expect(text(page, `You scored ${EXPECTED_SCORE} points`)).toBeVisible();
  const results = page.getByRole("listitem");
  await expect(results).toHaveCount(5);
  await expect(results.nth(0)).toContainText("Solved");
  await expect(results.nth(2)).toContainText("Skipped");
  await expect(results.nth(3)).toContainText("Revealed");

  // A finished adventure no longer shows a Continue card.
  await page.getByRole("link", { name: "Back to Discover" }).click();
  await expect(page.getByRole("heading", { name: /Don.t just visit/ })).toBeVisible();
  await expect(text(page, "Continue", true)).toHaveCount(0);

  // The whole playthrough ran under the Content-Security-Policy without anything blocked.
  expect(cspViolations).toEqual([]);
});

test("never sends answers, unrevealed hints or locked stops to the browser", async ({ page, context }) => {
  const bodies: string[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (res: Response) => {
    if (!res.url().startsWith("http://localhost")) return;
    const type = res.request().resourceType();
    if (type !== "document" && type !== "fetch") return;
    pending.push(
      res.text().then(
        (t) => void bodies.push(t),
        () => undefined, // redirects have no body
      ),
    );
  });

  await startAdventure(page);
  await page.reload();
  await checkIn(page);
  await text(page, STOP1.wrong, true).click();
  await checkAnswer(page);
  await expect(text(page, "Not quite. Try again, or take a hint.")).toBeVisible();
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(text(page, "Hint 1:")).toBeVisible();
  await page.reload();
  await expect(text(page, /Checked in at/)).toBeVisible();
  await Promise.all(pending);

  // Everything the server sent while the player was on stop 1.
  const sent = bodies.join("\n");
  expect(sent.length).toBeGreaterThan(1000);
  const forbidden = [
    ...STOP_TITLES.slice(1), // locked stops
    "[Stop 2 venue]",
    "[Stop 5 venue]",
    "Stop 4 backup",
    "41.1428", // stop 2 coordinates
    "They carried the barrels", // stop 1 hint 2 (not revealed)
    "She kept the line in a bread tin", // stop 2 hint
    "belongs to the people who work on it", // stop 1 explanation (not solved)
    "Rosário",
    "Ros\\u00e1rio", // same, JSON-escaped
    '"sete"',
    '"seven"',
    "acceptedAnswers",
    "correctOptionId",
    "allowFuzzy",
  ];
  for (const secret of forbidden) expect(sent, `leaked: ${secret}`).not.toContain(secret);

  // The guest's Supabase auth cookies are HttpOnly: page JavaScript can't read them.
  const authCookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  expect(authCookies.length).toBeGreaterThan(0);
  for (const c of authCookies) expect(c.httpOnly, c.name).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("auth-token");
  // The M1 cookie session store is gone.
  expect((await context.cookies()).some((c) => c.name === "ss_session")).toBe(false);
});
