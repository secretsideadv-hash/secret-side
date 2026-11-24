import { expect, test } from "@playwright/test";

const notFoundHeading = "This street doesn't go anywhere.";

test("an unknown URL shows the styled 404 with a way back to Discover", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: notFoundHeading })).toBeVisible();
  await page.getByRole("link", { name: "Back to Discover" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: notFoundHeading })).toHaveCount(0);
});

test("an unknown adventure shows the styled 404 and is not indexed", async ({ page }) => {
  // The slug is read inside <Suspense> (instant shell), so the first request has already
  // started streaming with 200 when notFound() runs; Next then marks it noindex. Cached
  // repeats return 404. Either way the visitor sees the 404 screen.
  const response = await page.goto("/adventures/no-such-adventure");
  expect([200, 404]).toContain(response?.status());
  await expect(page.getByRole("heading", { name: notFoundHeading })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content="noindex"]')).not.toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to Discover" })).toBeVisible();
});

test("the web app manifest and icons are served", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("Secret Side");
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"]')).not.toHaveCount(0);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Secret Side");
});
