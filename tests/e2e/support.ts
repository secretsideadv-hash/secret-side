import { existsSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared helpers for the e2e tests. They play the mock Saúde! adventure on the
 * production build, which reads .env.local and so uses the DEV Supabase project.
 *
 * MOCK: the answers, labels and titles below come from the mock content in
 * content/porto/saude.ts (the test can't import it: that module is server-only).
 * Update them when the verified content replaces the mock.
 */
export const STOP_TITLES = [
  "The river's line",
  "Up to the cathedral",
  "The station of goodbyes",
  "The grand avenue",
  "The last line",
];
export const STOP1 = { wrong: "The bishop", right: "The boatmen" };
export const STOP2_ANSWER = "rosario"; // accepted answer is "Rosário": accents are ignored
export const STOP4_WRONG = "six";
export const STOP5_RIGHT = "As a compass to find her way home";

export const PLAY_URL = /\/play\/[0-9a-f-]{36}$/;
export const UNLOCKED_URL = /\/play\/[0-9a-f-]{36}\/unlocked$/;

/**
 * Next 16 keeps recently visited pages mounted but hidden (React <Activity>) for
 * instant back navigation, so text lookups must ignore hidden copies.
 */
export const text = (page: Page, value: string | RegExp, exact = false) =>
  page.getByText(value, { exact }).filter({ visible: true });
export const label = (page: Page, value: string) => page.getByLabel(value).filter({ visible: true });

/** Session ids started by the tests, so their guests can be deleted afterwards. */
const startedSessions = new Set<string>();

export const sessionIdOf = (url: string) => url.match(/\/play\/([0-9a-f-]{36})/)![1]!;

export async function startAdventure(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("link", { name: /Saúde!/ }).first().click();
  await expect(page).toHaveURL(/\/adventures\/saude$/);
  await page.getByRole("button", { name: "Unlock adventure" }).click();
  await expect(page).toHaveURL(PLAY_URL);
  const id = sessionIdOf(page.url());
  startedSessions.add(id);
  return id;
}

export async function checkIn(page: Page) {
  await page.getByRole("button", { name: "I'm here" }).click();
  await expect(text(page, /Checked in at/)).toBeVisible();
}

export async function takeMeThere(page: Page) {
  await page.getByRole("link", { name: "Take me there" }).click();
  await expect(page).toHaveURL(PLAY_URL);
  // The URL changes before the Unlocked screen unmounts; wait for the Play screen itself.
  await expect(page.getByRole("heading", { name: "Destination unlocked" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Head to your next stop" })).toBeVisible();
}

export const checkAnswer = (page: Page) => page.getByRole("button", { name: "Check answer" }).click();

// ---------------------------------------------------------------------------
// Dev database access (verification and cleanup only)
// ---------------------------------------------------------------------------

const DEV_PROJECT_REF = "rekuyorpqcszmwkiwcsz";

/** Secret-key client for the DEV project; refuses to run against anything else. */
export function devAdmin(): SupabaseClient {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url.includes(DEV_PROJECT_REF) || !key) {
    throw new Error("e2e tests run only against the dev Supabase project (check .env.local).");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Deletes the anonymous guests behind the sessions this test file started (cascades to their sessions). */
export async function deleteTestGuests() {
  if (startedSessions.size === 0) return;
  const admin = devAdmin();
  const { data } = await admin.from("sessions").select("owner_id").in("id", [...startedSessions]);
  for (const owner of new Set((data ?? []).map((r: { owner_id: string }) => r.owner_id))) {
    await admin.auth.admin.deleteUser(owner);
  }
  startedSessions.clear();
}
