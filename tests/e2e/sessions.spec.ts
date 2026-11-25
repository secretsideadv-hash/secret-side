import { expect, test, type Page, type Request } from "@playwright/test";
import {
  STOP1,
  UNLOCKED_URL,
  checkAnswer,
  checkIn,
  deleteTestGuests,
  devAdmin,
  label,
  startAdventure,
  text,
} from "./support";

/**
 * Sessions live in Supabase, owned by the browser's anonymous guest (M2):
 * they survive closing the browser, a replayed request is rejected by the
 * version check, and nobody else can open or act on them.
 */

test.afterAll(deleteTestGuests);

/** The next Server Action POST the page sends (what an attacker could copy and resend). */
function nextServerAction(page: Page): Promise<Request> {
  return page.waitForRequest((r) => r.method() === "POST" && "next-action" in r.headers());
}

/** Re-sends a captured Server Action request from the given page's browser context. */
async function replay(page: Page, original: Request): Promise<string> {
  const headers = await original.allHeaders();
  for (const h of ["host", "content-length", "cookie", "connection"]) delete headers[h];
  const res = await page.request.post(original.url(), { headers, data: original.postData() ?? "" });
  return res.text();
}

async function storedStop(sessionId: string, position: number) {
  const admin = devAdmin();
  const { data: session } = await admin.from("sessions").select("version, experience_id").eq("id", sessionId).single();
  const { data: stop } = await admin
    .from("stops")
    .select("id")
    .eq("experience_id", session!.experience_id)
    .eq("position", position)
    .single();
  const { data: progress } = await admin
    .from("session_stops")
    .select("wrong_attempts, status")
    .eq("session_id", sessionId)
    .eq("stop_id", stop!.id)
    .single();
  return { version: session!.version as number, ...(progress as { wrong_attempts: number; status: string }) };
}

test("closing and reopening the browser resumes the adventure where it was", async ({ browser }) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  const sessionId = await startAdventure(page);
  await checkIn(page);
  await text(page, STOP1.right, true).click();
  await checkAnswer(page);
  await expect(page).toHaveURL(UNLOCKED_URL);

  // Closing a browser drops session-only cookies; keep only the persistent ones.
  const saved = await first.storageState();
  const persistent = saved.cookies.filter((c) => c.expires > 0);
  expect(persistent.some((c) => c.name.startsWith("sb-"))).toBe(true);
  await first.close();

  const reopened = await browser.newContext({ storageState: { cookies: persistent, origins: [] } });
  const again = await reopened.newPage();
  await again.goto("/");
  const continueCard = again.getByRole("link", { name: /Continue Saúde!/ });
  await expect(continueCard).toBeVisible();
  await expect(continueCard).toContainText("Stop 2 of 5");
  await continueCard.click();
  await expect(again).toHaveURL(new RegExp(`/play/${sessionId}$`));
  await expect(label(again, "Stop 2 of 5")).toHaveText("2/5");
  await expect(again.getByRole("heading", { name: "Head to your next stop" })).toBeVisible();

  // Unlocking again resumes the same session instead of starting a second one.
  await again.goto("/adventures/saude");
  await again.getByRole("button", { name: "Unlock adventure" }).click();
  await expect(again).toHaveURL(new RegExp(`/play/${sessionId}$`));
  await reopened.close();
});

test("replaying an old request is rejected and changes nothing", async ({ page }) => {
  const sessionId = await startAdventure(page);
  await checkIn(page);

  // A wrong answer: the request an attacker (or a flaky network) might resend.
  await text(page, STOP1.wrong, true).click();
  const wrongAnswer = nextServerAction(page);
  await checkAnswer(page);
  const captured = await wrongAnswer;
  await expect(text(page, "Not quite. Try again, or take a hint.")).toBeVisible();
  const before = await storedStop(sessionId, 1);
  expect(before.wrong_attempts).toBe(1);

  // Resent as-is, with the same cookies: the version it carries is now old.
  const body = await replay(page, captured);
  expect(body).toContain('"stale"');
  const after = await storedStop(sessionId, 1);
  expect(after).toEqual(before); // no extra wrong attempt, no new version

  // The real screen still works: the next action carries the current version.
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(text(page, "Hint 1:")).toBeVisible();
  expect((await storedStop(sessionId, 1)).version).toBe(before.version + 1);
});

test("another browser can't open or act on the session", async ({ page, browser }) => {
  const sessionId = await startAdventure(page);
  const url = page.url();
  const checkInRequest = nextServerAction(page);
  await checkIn(page);
  const captured = await checkInRequest;

  // A browser with no guest at all.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(url);
  await expect(strangerPage.getByRole("heading", { name: "This adventure isn't on this phone" })).toBeVisible();

  // A browser that is a guest too (it started its own adventure).
  const otherGuest = await browser.newContext();
  const otherPage = await otherGuest.newPage();
  await startAdventure(otherPage);
  await otherPage.goto(url);
  await expect(otherPage.getByRole("heading", { name: "This adventure isn't on this phone" })).toBeVisible();
  await expect(text(otherPage, /Checked in at/)).toHaveCount(0);

  // Sending this session's action from the other guest's browser is refused.
  const before = await storedStop(sessionId, 1);
  const body = await replay(otherPage, captured);
  expect(body).toContain('"not_found"');
  expect(await storedStop(sessionId, 1)).toEqual(before);

  await stranger.close();
  await otherGuest.close();
});
