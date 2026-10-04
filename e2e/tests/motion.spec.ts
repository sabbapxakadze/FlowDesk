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
});
