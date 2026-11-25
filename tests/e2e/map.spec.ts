import { expect, test, type Page } from "@playwright/test";
import { STOP1_POSITION, checkIn, deleteTestGuests, northOf, startAdventure, text, watchCspViolations } from "./support";

/**
 * The map behind <MapView>: MapLibre GL + OpenFreeMap tiles with our dark 3D
 * style, falling back to the static map when it can't run. Markers come from
 * VisibleState only, so locked stops never appear.
 */

test.afterAll(deleteTestGuests);

const TILES = "https://tiles.openfreemap.org/**";

/** The map on the visible screen (Next keeps earlier pages mounted but hidden). */
const map = (page: Page) => page.locator("[data-map-state]").filter({ visible: true }).first();

test("shows the live 3D map with only the current stop, attribution and a remembered 2D/3D choice", async ({ page }) => {
  const csp = watchCspViolations(page);
  await startAdventure(page);

  await expect(map(page)).toHaveAttribute("data-map-state", "live", { timeout: 20_000 });
  await expect(map(page).locator("canvas")).toBeVisible();
  await expect(map(page).getByText("OpenStreetMap")).toBeVisible();
  await expect(map(page).getByText("OpenMapTiles")).toBeVisible();

  // Stop 1 only: the current stop. Locked stops are never drawn.
  const markers = map(page).locator("[data-map-marker]");
  await expect(markers).toHaveCount(1);
  await expect(markers.first()).toHaveAttribute("data-map-marker", "current");
  await expect(markers.first()).toHaveAttribute("aria-label", /^Stop 1:/);

  // 2D/3D toggle, remembered across a reload.
  const twoD = map(page).getByRole("button", { name: "2D" });
  const threeD = map(page).getByRole("button", { name: "3D" });
  await expect(threeD).toHaveAttribute("aria-pressed", "true");
  await twoD.click();
  await expect(twoD).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(map(page)).toHaveAttribute("data-map-state", "live", { timeout: 20_000 });
  await expect(map(page).getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");

  expect(csp).toEqual([]);
});

test.describe("falls back to the static map", () => {
  test("when the tiles can't be fetched", async ({ page }) => {
    await page.route(TILES, (route) => route.abort());
    await startAdventure(page);
    await expect(map(page)).toHaveAttribute("data-map-state", "fallback", { timeout: 15_000 });
    await expect(map(page).getByText("Simplified map")).toBeVisible();
    await expect(map(page).getByRole("img")).toBeVisible(); // the static drawing, with its text alternative
    await checkIn(page); // the adventure carries on
  });

  test("when the browser has no WebGL", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof original;
    });
    let tileRequests = 0;
    page.on("request", (r) => r.url().startsWith("https://tiles.openfreemap.org") && tileRequests++);
    await startAdventure(page);
    await expect(map(page)).toHaveAttribute("data-map-state", "fallback");
    await expect(map(page).getByText("Simplified map")).toBeVisible();
    expect(tileRequests).toBe(0); // no WebGL: MapLibre isn't even loaded
  });

  test("when nothing has loaded within 8 seconds", async ({ page }) => {
    await page.route(TILES, () => {
      // Never answer: the tile server hangs.
    });
    await startAdventure(page);
    await expect(map(page)).toHaveAttribute("data-map-state", "loading");
    await expect(map(page)).toHaveAttribute("data-map-state", "fallback", { timeout: 15_000 });
    await expect(text(page, "Simplified map")).toBeVisible();
  });

  test("when the WebGL context is lost", async ({ page }) => {
    await startAdventure(page);
    await expect(map(page)).toHaveAttribute("data-map-state", "live", { timeout: 20_000 });
    await map(page)
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      });
    await expect(map(page)).toHaveAttribute("data-map-state", "fallback");
    await expect(map(page).getByText("Simplified map")).toBeVisible();
  });
});

test.describe("the player's position", () => {
  test.describe("about 1.5 km from the stop", () => {
    test.use({ permissions: ["geolocation"], geolocation: northOf(STOP1_POSITION, 1_500, 20) });

    test("\"Show me\" fits both the player and the stop", async ({ page }) => {
      await startAdventure(page);
      await expect(map(page)).toHaveAttribute("data-map-state", "live", { timeout: 20_000 });
      const showMe = map(page).getByRole("button", { name: "Show me" });
      await expect(showMe).toBeVisible();
      await showMe.click();
      await expect(showMe).toBeHidden(); // the player is in view now
    });
  });

  test.describe("far outside the play area", () => {
    test.use({ permissions: ["geolocation"], geolocation: northOf(STOP1_POSITION, 20_000, 20) });

    test("shows the distance instead of zooming out", async ({ page }) => {
      await startAdventure(page);
      await expect(map(page)).toHaveAttribute("data-map-state", "live", { timeout: 20_000 });
      await expect(map(page).getByText("You're 20 km away")).toBeVisible();
      await expect(map(page).getByRole("button", { name: "Show me" })).toHaveCount(0);
    });
  });
});

test.describe("full screen", () => {
  const fullscreen = (page: Page) => page.getByRole("dialog", { name: "Full-screen map" });

  test("opens the same live map with its controls and SOS, and closes back to the card", async ({ page }) => {
    const csp = watchCspViolations(page);
    await startAdventure(page);
    await expect(map(page)).toHaveAttribute("data-map-state", "live", { timeout: 20_000 });

    await map(page).getByRole("button", { name: "Expand map" }).click();
    const full = fullscreen(page);
    await expect(full).toBeVisible();
    await expect(full.getByRole("button", { name: "Close full-screen map" })).toBeFocused();

    // The same map instance moved over: canvas, current stop only, attribution, toggle, Google Maps link.
    await expect(full.locator("canvas")).toBeVisible();
    await expect(map(page).locator("canvas")).toHaveCount(0);
    const markers = full.locator("[data-map-marker]");
    await expect(markers).toHaveCount(1);
    await expect(markers.first()).toHaveAttribute("data-map-marker", "current");
    await expect(full.getByText("OpenStreetMap")).toBeVisible();
    await expect(full.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", /google\.com\/maps/);
    await full.getByRole("button", { name: "2D" }).click();
    await expect(full.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");

    // Fills the screen.
    const box = await full.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box?.width).toBe(viewport.width);
    expect(box?.height).toBe(viewport.height);

    // SOS stays one tap away; closing the Emergency view returns to the full-screen map.
    await full.getByRole("button", { name: "Emergency" }).click();
    const emergency = page.getByRole("dialog", { name: "Emergency" }).filter({ visible: true });
    await expect(emergency.getByRole("link", { name: "Call 112" })).toBeVisible();
    await emergency.getByRole("button", { name: "Close emergency view" }).click();
    await expect(full).toBeVisible();

    // Escape closes too; the map is back in the card, still live, and focus returns to "Expand map".
    await page.keyboard.press("Escape");
    await expect(full).toBeHidden();
    await expect(map(page).locator("canvas")).toBeVisible();
    await expect(map(page)).toHaveAttribute("data-map-state", "live");
    await expect(map(page).getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    await expect(map(page).getByRole("button", { name: "Expand map" })).toBeFocused();

    // And the close button.
    await map(page).getByRole("button", { name: "Expand map" }).click();
    await full.getByRole("button", { name: "Close full-screen map" }).click();
    await expect(full).toBeHidden();
    expect(csp).toEqual([]);
  });

  test("from the Emergency view, closing the map leaves the Emergency view open", async ({ page }) => {
    await startAdventure(page);
    await page.getByRole("button", { name: "Emergency" }).filter({ visible: true }).click();
    const emergency = page.getByRole("dialog", { name: "Emergency" });
    await emergency.getByRole("button", { name: "Expand map" }).click();
    const full = fullscreen(page).filter({ visible: true });
    await expect(full).toBeVisible();
    await full.getByRole("button", { name: "Close full-screen map" }).click();
    await expect(full).toHaveCount(0);
    await expect(emergency.getByRole("link", { name: "Call 112" })).toBeVisible();
  });

  test("works with the static fallback", async ({ page }) => {
    await page.route(TILES, (route) => route.abort());
    await startAdventure(page);
    await expect(map(page)).toHaveAttribute("data-map-state", "fallback", { timeout: 15_000 });
    await map(page).getByRole("button", { name: "Expand map" }).click();
    const full = fullscreen(page);
    await expect(full.getByText("Simplified map")).toBeVisible();
    await expect(full.getByRole("img", { name: /Stop 1/ })).toBeVisible();
    await expect(full.getByRole("button", { name: "Emergency" })).toBeVisible();
    await full.getByRole("button", { name: "Close full-screen map" }).click();
    await expect(full).toBeHidden();
    await checkIn(page); // the adventure carries on
  });

  test.describe("with the player's position", () => {
    // South of the stop: behind the pitched camera, so off screen even in full screen.
    test.use({ permissions: ["geolocation"], geolocation: northOf(STOP1_POSITION, -1_500, 20) });

    test("shows the player and \"Show me\" in full screen", async ({ page }) => {
      await startAdventure(page);
      await expect(map(page)).toHaveAttribute("data-map-state", "live", { timeout: 20_000 });
      await map(page).getByRole("button", { name: "Expand map" }).click();
      const showMe = fullscreen(page).getByRole("button", { name: "Show me" });
      await expect(showMe).toBeVisible();
      await showMe.click();
      await expect(showMe).toBeHidden();
    });
  });
});
