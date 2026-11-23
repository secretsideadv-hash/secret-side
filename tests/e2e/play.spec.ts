import { expect, test, type Page, type Response } from "@playwright/test";

/**
 * Plays the whole mock Saúde! adventure through the UI, like a player would.
 *
 * MOCK: the answers, labels and titles below come from the mock content in
 * content/porto/saude.ts (the test can't import it: that module is server-only).
 * Update them when the verified content replaces the mock.
 */
const STOP_TITLES = [
  "The river's line",
  "Up to the cathedral",
  "The station of goodbyes",
  "The grand avenue",
  "The last line",
];
const STOP1 = { wrong: "The bishop", right: "The boatmen" };
const STOP2_ANSWER = "rosario"; // accepted answer is "Rosário": accents are ignored
const STOP4_WRONG = "six";
const STOP5_RIGHT = "As a compass to find her way home";
const EXPECTED_SCORE = 355; // 85 (1 hint) + 100 + 50 (skip) + 20 (2 hints + reveal) + 100

const PLAY_URL = /\/play\/[0-9a-f-]{36}$/;
const UNLOCKED_URL = /\/play\/[0-9a-f-]{36}\/unlocked$/;

/**
 * Next 16 keeps recently visited pages mounted but hidden (React <Activity>) for
 * instant back navigation, so text lookups must ignore hidden copies.
 */
const text = (page: Page, value: string | RegExp, exact = false) =>
  page.getByText(value, { exact }).filter({ visible: true });
const label = (page: Page, value: string) => page.getByLabel(value).filter({ visible: true });

async function startAdventure(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: /Saúde!/ }).first().click();
  await expect(page).toHaveURL(/\/adventures\/saude$/);
  await page.getByRole("button", { name: "Unlock adventure" }).click();
  await expect(page).toHaveURL(PLAY_URL);
}

async function checkIn(page: Page) {
  await page.getByRole("button", { name: "I'm here" }).click();
  await expect(text(page, /Checked in at/)).toBeVisible();
}

async function takeMeThere(page: Page) {
  await page.getByRole("link", { name: "Take me there" }).click();
  await expect(page).toHaveURL(PLAY_URL);
  // The URL changes before the Unlocked screen unmounts; wait for the Play screen itself.
  await expect(page.getByRole("heading", { name: "Destination unlocked" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Head to your next stop" })).toBeVisible();
}

const checkAnswer = (page: Page) => page.getByRole("button", { name: "Check answer" }).click();

test("plays the whole adventure from Discover to the completion screen", async ({ page }) => {
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

  // The session cookie is HttpOnly: page JavaScript can't read it.
  const cookie = (await context.cookies()).find((c) => c.name === "ss_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("ss_session");
});

test("a session can't be opened from another browser", async ({ page, browser }) => {
  await startAdventure(page);
  const url = page.url();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(url);
  await expect(otherPage.getByRole("heading", { name: "This adventure isn't on this phone" })).toBeVisible();
  await other.close();
});
