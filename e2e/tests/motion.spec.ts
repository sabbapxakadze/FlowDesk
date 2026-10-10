import type { Page } from "@playwright/test";
import { test, expect, TEST_USER } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * The app's motion (owner's design pass, 2026-10-04). The rest of the suite runs with the system setting
 * "reduce motion" (e2e/playwright.config.ts), which turns every animation off; this file opts back in to test
 * the animations themselves, and has one block that proves "reduce motion" really switches them off.
 */

/** Counts document.startViewTransition() calls (the theme change is one), without changing what the browser does with them. */
async function countViewTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __viewTransitions: number };
    w.__viewTransitions = 0;
    const original = (document as unknown as { startViewTransition?: (cb: () => void) => unknown }).startViewTransition?.bind(document);
    if (original) {
      (document as unknown as { startViewTransition: (cb: () => void) => unknown }).startViewTransition = (cb) => {
        w.__viewTransitions++;
        return original(cb);
      };
    }
  });
}
test.describe("with animations on", () => {
  test.use({ reducedMotion: "no-preference" });

  test("logging in cross-fades into the app: one view transition, and the app is shown", async ({ page }) => {
    // Why: a successful login used to cut from the login card to the app in one frame. It now runs a view transition (the same fade as the
    // theme change) around the route change, once.
    await page.request.post("/api/v1/auth/register", { data: TEST_USER });
    await countViewTransitions(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(new RegExp(`^Good (morning|afternoon|evening), ${TEST_USER.name.split(" ")[0]}$`))).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __viewTransitions: number }).__viewTransitions)).toBe(1);
  });

  test("the issue panel slides in without touching the page behind it; closing is immediate (focus back, inert) and it slides out before it is removed; another issue keeps the same panel", async ({
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
    // Nothing behind the panel changes: no dimming layer (the owner tried it and did not want it).
    await expect(page.locator("div.pointer-events-none.fixed.inset-0")).toHaveCount(0);

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
  });

});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

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
