import { expect, test, type Page } from "@playwright/test";
import {
  STOP1,
  STOP1_POSITION,
  STOP_TITLES,
  UNLOCKED_URL,
  checkAnswer,
  checkIn,
  deleteTestGuests,
  devAdmin,
  sessionIdOf,
  startAdventure,
  takeMeThere,
  text,
} from "./support";

/**
 * The Emergency view (GAME_RULES §11): always reachable, works offline, 112
 * first, and "show all remaining stops" ends the adventure on the server first.
 */

test.afterAll(deleteTestGuests);

const emergencyButton = (page: Page) => page.getByRole("button", { name: "Emergency" }).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Emergency" });

async function openAndClose(page: Page, where: string) {
  await expect(emergencyButton(page), where).toBeEnabled();
  await emergencyButton(page).click();
  await expect(sheet(page), where).toBeVisible();
  await expect(sheet(page).getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");
  await sheet(page).getByRole("button", { name: "Close emergency view" }).click();
  await expect(sheet(page)).toBeHidden();
}

test("is reachable on every active screen, whatever state the stop is in", async ({ page }) => {
  test.setTimeout(90_000);
  await startAdventure(page);
  await openAndClose(page, "on the way to stop 1");

  await page.getByRole("button", { name: "Stuck? Skip this stop" }).click();
  await expect(page.getByRole("button", { name: "Skip stop" })).toBeVisible();
  await openAndClose(page, "with the skip confirmation open");
  await page.getByRole("button", { name: "Keep playing" }).click();

  await checkIn(page);
  await openAndClose(page, "at the question");

  for (let i = 0; i < 5; i++) {
    await text(page, STOP1.wrong, true).click();
    await checkAnswer(page);
    await expect(page.getByRole("button", { name: /Check answer|Checking/ })).toBeVisible();
  }
  await expect(text(page, /Lots of tries in a row/)).toBeVisible();
  await openAndClose(page, "during the wrong-answer cooldown");

  await page.waitForTimeout(3_200); // let the cooldown pass
  await text(page, STOP1.right, true).click();
  await checkAnswer(page);
  await expect(page).toHaveURL(UNLOCKED_URL);
  await openAndClose(page, "on the Unlocked screen");
});

test("works offline: 112, the stops reached and the way back; the reveal explains it needs a connection", async ({
  page,
  context,
}) => {
  await startAdventure(page);
  await checkIn(page);
  await context.setOffline(true);
  try {
    await emergencyButton(page).click();
    await expect(sheet(page).getByRole("link", { name: "Call 112" })).toBeVisible();
    await expect(sheet(page).getByText(`1. ${STOP_TITLES[0]}`)).toBeVisible();
    await expect(sheet(page).getByRole("link", { name: /Walking directions to the start/ })).toHaveAttribute(
      "href",
      /destination=41\.1407%2C-8\.6131/,
    );
    await sheet(page).getByRole("button", { name: "Show all remaining stops" }).click();
    await sheet(page).getByRole("button", { name: "End and show stops" }).click();
    await expect(sheet(page).getByText(/You need a connection to show the remaining stops/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test.describe("with location allowed", () => {
  test.use({ permissions: ["geolocation"], geolocation: { ...STOP1_POSITION, accuracy: 12 } });

  test("shows the player's coordinates to read out", async ({ page }) => {
    await startAdventure(page);
    await emergencyButton(page).click();
    await expect(sheet(page).getByText("41.14070, -8.61310")).toBeVisible();
    await expect(sheet(page).getByText(/Accurate to about 12 m/)).toBeVisible();
  });
});

test("without location, the position is one tap away and never asked for on its own", async ({ page }) => {
  await startAdventure(page);
  await emergencyButton(page).click();
  await expect(sheet(page).getByRole("button", { name: "Show my position" })).toBeVisible();
});

test("showing all remaining stops ends the adventure on the server first, then reveals them", async ({ page }) => {
  test.setTimeout(60_000);
  const sessionId = await startAdventure(page);
  await checkIn(page);
  await text(page, STOP1.right, true).click();
  await checkAnswer(page);
  await expect(page).toHaveURL(UNLOCKED_URL);
  await takeMeThere(page);

  // Still playing: locked stops are nowhere on the page.
  const before = await page.content();
  for (const title of STOP_TITLES.slice(2)) expect(before).not.toContain(title);

  await emergencyButton(page).click();
  await sheet(page).getByRole("button", { name: "Show all remaining stops" }).click();
  await expect(sheet(page).getByText(/ends your adventure/)).toBeVisible();
  await expect(sheet(page).getByText(/all 4 remaining stops are/)).toBeHidden(); // stop 2 is current, so 3 remain
  await expect(sheet(page).getByText(/all 3 remaining stops are/)).toBeVisible();
  await sheet(page).getByRole("button", { name: "End and show stops" }).click();

  await expect(page).toHaveURL(new RegExp(`/play/${sessionId}/complete$`));
  await expect(text(page, "Adventure ended early")).toBeVisible();
  await expect(text(page, "You scored 100 points", false)).toBeVisible();
  for (const [i, title] of STOP_TITLES.entries()) await expect(text(page, `${i + 1}. ${title}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Directions" }).filter({ visible: true })).toHaveCount(5);

  const { data } = await devAdmin().from("sessions").select("status, end_reason, score").eq("id", sessionIdOf(page.url())).single();
  expect(data).toEqual({ status: "completed", end_reason: "emergency", score: 100 });

  // The adventure can't be resumed: the play page sends you to the finale.
  await page.goto(`/play/${sessionId}`);
  await expect(page).toHaveURL(new RegExp(`/play/${sessionId}/complete$`));
});
