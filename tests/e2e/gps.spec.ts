import { expect, test } from "@playwright/test";
import { STOP1_POSITION, deleteTestGuests, devAdmin, northOf, sessionIdOf, startAdventure, text } from "./support";

/**
 * GPS check-in on the Play screen (GAME_RULES §5), with Playwright's fake
 * geolocation. The server decides; the screen shows distance and offers manual
 * check-in ("I'm here") when GPS can't help.
 */

test.afterAll(deleteTestGuests);

const manualButton = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "I'm here" });

async function stop1Progress(sessionId: string) {
  const admin = devAdmin();
  const { data } = await admin
    .from("session_stops")
    .select("status, check_in_method, check_in_distance_m, check_in_accuracy_m, stops!inner(position)")
    .eq("session_id", sessionId)
    .eq("stops.position", 1)
    .single();
  return data as unknown as { status: string; check_in_method: string; check_in_distance_m: number; check_in_accuracy_m: number };
}

test.describe("with location allowed", () => {
  test.use({ permissions: ["geolocation"], geolocation: northOf(STOP1_POSITION, 643, 10) });

  test("shows the distance, says too far, then checks in by GPS at the stop", async ({ page, context }) => {
    await startAdventure(page);
    const sessionId = sessionIdOf(page.url());

    // Already allowed: no explanation card, live distance straight away; manual not offered yet.
    await expect(text(page, "About 640 m away")).toBeVisible();
    await expect(text(page, "GPS ±10 m")).toBeVisible();
    await expect(manualButton(page)).toHaveCount(0);

    // Checking in from 640 m away: the server says too far, and "I'm here" appears.
    await page.getByRole("button", { name: "Check in here" }).click();
    await expect(text(page, /Your GPS puts you about 640 m from the stop/)).toBeVisible();
    await expect(manualButton(page)).toBeVisible();

    // Walk to the door.
    await context.setGeolocation(northOf(STOP1_POSITION, 22, 9));
    await expect(text(page, "You're here.")).toBeVisible();
    await page.getByRole("button", { name: "You're here: check in" }).click();
    await expect(text(page, /Checked in at/)).toBeVisible();

    expect(await stop1Progress(sessionId)).toMatchObject({
      status: "arrived",
      check_in_method: "gps",
      check_in_distance_m: 22,
      check_in_accuracy_m: 9,
    });
  });
});

test("doesn't ask for location until the player taps, and refusing leads to manual check-in", async ({ page }) => {
  // No permission granted: the browser refuses when asked.
  await startAdventure(page);
  await expect(text(page, "Check in with your location")).toBeVisible();
  await expect(text(page, /never store where you are/)).toBeVisible();
  await expect(manualButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(text(page, /Location is off for this site/)).toBeVisible();
  await expect(text(page, /allow location for this site in your browser settings/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use my location" })).toHaveCount(0);

  await manualButton(page).click();
  await expect(text(page, /Checked in at/)).toBeVisible();
  expect((await stop1Progress(sessionIdOf(page.url()))).check_in_method).toBe("manual");
});

test.describe("with a poor GPS signal", () => {
  test.use({ permissions: ["geolocation"], geolocation: northOf(STOP1_POSITION, 5, 300) });

  test("says GPS is unsure and offers manual check-in after 20 seconds", async ({ page }) => {
    await page.clock.install();
    await startAdventure(page);
    await expect(text(page, "GPS is unsure here (±300 m).")).toBeVisible();
    await expect(manualButton(page)).toHaveCount(0);

    await page.clock.fastForward(21_000);
    await expect(manualButton(page)).toBeVisible();
    await expect(text(page, /Tap “I'm here” if you've arrived/)).toBeVisible();
  });
});
