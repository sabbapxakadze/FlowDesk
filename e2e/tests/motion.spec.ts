import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * The app's motion (owner's design pass, 2026-10-04). The rest of the suite runs with the system setting
 * "reduce motion" (e2e/playwright.config.ts), which turns every animation off; this file opts back in to test
 * the animations themselves, and has one block that proves "reduce motion" really switches them off.
 */

const animationOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);

test.describe("with animations on", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a page change plays the rise-in, but a filter or the side panel (query string only) does not replay it", async ({
    loggedInPage: page,
  }) => {
    // Why: the page is keyed by PATH. Keyed by the full address, every filter click or issue panel would make
    // the whole page rise again, which would look like a reload.
    const { projectId } = await createIssueViaApi(page.request, {
      projectName: "Website",
      projectKey: "WEB",
      titles: ["One"],
    });
    await page.goto("/projects");
    expect(await animationOf(page, "div.motion-rise-in")).toBe("motion-rise-in");

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole("link", { name: /One/ }).first()).toBeVisible();
    // Mark the page wrapper; it must survive a query-string change and be replaced by a path change.
    await page.evaluate(() => document.querySelector("div.motion-rise-in")!.setAttribute("data-probe", "1"));
    await page.getByLabel("Filter by status").selectOption("todo");
    await expect(page).toHaveURL(/status=todo/);
    expect(await page.locator("div.motion-rise-in[data-probe]").count()).toBe(1);

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Board" }).click();
    await expect(page).toHaveURL(/\/board$/);
    expect(await page.locator("div.motion-rise-in[data-probe]").count()).toBe(0);
  });

  test("a running request shows a spinner on the button, and a saved profile shows a tick for a moment", async ({
    loggedInPage: page,
  }) => {
    // Why: the progress cue (spinner) and the success cue (tick) are the owner's pick for buttons.
    await page.route("**/api/v1/users/me/profile", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    await page.goto("/profile");
    await page.getByLabel("About you (optional)").fill("Hello");
    const save = page.getByRole("button", { name: /Sav/ });
    await save.click();
    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect(save.locator("svg.animate-spin")).toHaveCount(1);
    await expect(save.locator("svg.lucide-check")).toHaveCount(1); // the tick, once it is saved
    await expect(save.locator("svg.lucide-check")).toHaveCount(0, { timeout: 3000 }); // and it goes away again
  });

  test("an edit form that opens in place rises in", async ({ loggedInPage: page }) => {
    const { projectId } = await createIssueViaApi(page.request, {
      projectName: "Website",
      projectKey: "WEB",
      titles: ["Edit me"],
    });
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("listitem").filter({ hasText: "Edit me" }).getByRole("button", { name: "Edit" }).click();
    const form = page.locator("form.motion-rise-in").first();
    await expect(form).toBeVisible();
    expect(await form.evaluate((el) => getComputedStyle(el).animationName)).toBe("motion-rise-in");
  });

  test("switching the theme cross-fades the colours: the class is on the page for a moment, then gone", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/projects");
    await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: /Dark/i }).click();
    await expect(page.locator("html")).toHaveClass(/motion-theme-fade/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).not.toHaveClass(/motion-theme-fade/, { timeout: 2000 });
  });

  test("the issue panel slides in and dims the page; closing is immediate (focus back, inert) and it slides out before it is removed; another issue keeps the same panel", async ({
    loggedInPage: page,
  }) => {
    // Why: the owner's panel pick. The exit animation must never delay the CLOSE itself: focus returns and
    // the panel stops reacting at once, only the unmount is late. The exit timer (220ms) is stretched 10x in
    // this test so the in-between state can be inspected without racing the clock.
    await page.addInitScript(() => {
      const original = window.setTimeout.bind(window);
      window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
        original(fn, ms === 220 ? 2200 : ms, ...args)) as typeof window.setTimeout;
    });
    const { projectId } = await createIssueViaApi(page.request, {
      projectName: "Website",
      projectKey: "WEB",
      titles: ["Alpha", "Beta"],
    });
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("link", { name: /Alpha/ }).first().click();

    const panel = page.locator('section[aria-label="Issue"]');
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe("motion-slide-in-right");
    await expect(page.locator("div.pointer-events-none.fixed.inset-0")).toHaveCount(1); // the dim, which never catches a click

    // Another issue: the same panel element, not a new one sliding in again.
    await panel.evaluate((el) => el.setAttribute("data-probe", "1"));
    await page.getByRole("link", { name: /Beta/ }).first().click();
    await expect(panel.getByRole("heading", { level: 2, name: "Beta" })).toBeVisible();
    expect(await page.locator('section[aria-label="Issue"][data-probe]').count()).toBe(1);

    await panel.getByRole("button", { name: "Close panel" }).click();
    // Already closed in every way that matters...
    await expect(panel).toHaveAttribute("inert", "");
    await expect(page).not.toHaveURL(/issue=/);
    // Focus is back on the card that opened the panel (a link), not lost on the page body (whose text would
    // contain "Alpha" too, which is why the element itself is checked).
    const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent ?? "" }));
    expect(focused.tag).toBe("A");
    expect(focused.text).toContain("Alpha");
    expect(focused.text).not.toContain("Beta");
    // ...while it is still on screen, sliding out, until the exit finishes.
    expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe("motion-slide-out-right");
    await expect(panel).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator("div.pointer-events-none.fixed.inset-0")).toHaveCount(0);
  });

  test("a dialog fades and grows in and out (the backdrop too), and is really gone afterwards", async ({
    loggedInPage: page,
  }) => {
    // Why: the owner's dialog pick (native <dialog> with @starting-style and allow-discrete). The duration is set
    // to 1s in this test so the middle of the transition can be sampled.
    await page.goto("/projects");
    await page.addStyleTag({ content: ":root { --motion-duration-base: 1000ms; }" });
    const dialog = page.locator("dialog.motion-dialog").first();
    const sample = () =>
      dialog.evaluate((el) => ({
        opacity: Number(getComputedStyle(el).opacity),
        display: getComputedStyle(el).display,
        open: (el as HTMLDialogElement).open,
      }));

    await page.keyboard.press("Control+k");
    const opening = await sample();
    expect(opening.open).toBe(true);
    expect(opening.opacity).toBeLessThan(0.9); // still fading in
    await page.waitForTimeout(1200);
    expect((await sample()).opacity).toBe(1);

    await page.keyboard.press("Escape");
    const closing = await sample();
    expect(closing.open).toBe(false); // closed for the app (Esc, focus, the page behind)...
    expect(closing.display).not.toBe("none"); // ...but still on screen while it fades out
    await page.waitForTimeout(1200);
    expect((await sample()).display).toBe("none");
  });

  test("the notifications dropdown drops in and fades out before it is removed", async ({ loggedInPage: page }) => {
    // Why: the owner's dropdown pick. The exit timer (120ms) is stretched 10x so the fade-out state can be seen.
    await page.addInitScript(() => {
      const original = window.setTimeout.bind(window);
      window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
        original(fn, ms === 120 ? 1200 : ms, ...args)) as typeof window.setTimeout;
    });
    await page.goto("/projects");
    const bell = page.getByRole("button", { name: "Notifications" });
    await bell.click();
    const dropdown = page.locator("div.absolute.z-50", { hasText: "Notifications" }).first();
    await expect(dropdown).toBeVisible();
    expect(await dropdown.evaluate((el) => getComputedStyle(el).animationName)).toBe("motion-drop-in");
    await bell.click();
    expect(await dropdown.evaluate((el) => getComputedStyle(el).animationName)).toBe("motion-fade-out");
    await expect(dropdown).toHaveCount(0, { timeout: 4000 });
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing animates: no rise-in, no theme fade", async ({ loggedInPage: page }) => {
    // Why: people who asked for less motion must get none, and nothing may wait for an animation that never runs.
    await page.goto("/projects");
    expect(await animationOf(page, "div.motion-rise-in")).toBe("none");
    await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: /Dark/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).not.toHaveClass(/motion-theme-fade/);
  });

  test("the issue panel is removed at once when closed: nothing waits for an animation that does not run", async ({
    loggedInPage: page,
  }) => {
    const { projectId } = await createIssueViaApi(page.request, {
      projectName: "Website",
      projectKey: "WEB",
      titles: ["Alpha"],
    });
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("link", { name: /Alpha/ }).first().click();
    const panel = page.locator('section[aria-label="Issue"]');
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await panel.getByRole("button", { name: "Close panel" }).click();
    await expect(panel).toHaveCount(0, { timeout: 300 });
  });
});
