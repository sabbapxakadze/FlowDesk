import type { Page } from "@playwright/test";
import { test, expect, TEST_USER } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { combobox, pick } from "../support/dropdown";

/**
 * The app's motion (owner's design pass, 2026-10-04). The rest of the suite runs with the system setting
 * "reduce motion" (e2e/playwright.config.ts), which turns every animation off; this file opts back in to test
 * the animations themselves, and has one block that proves "reduce motion" really switches them off.
 */


/** Records every Element.animate() call, so a test can see which rows opened or closed without timing it. */
async function recordRowAnimations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __rowAnims: { kind: "enter" | "leave"; tag: string }[] };
    w.__rowAnims = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const frames = keyframes as Keyframe[];
      if (Array.isArray(frames) && frames.length === 2 && "height" in frames[0]!) {
        w.__rowAnims.push({ kind: frames[0]!.height === "0px" ? "enter" : "leave", tag: this.tagName });
      }
      return original.call(this, keyframes, options);
    };
  });
}
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
const rowAnimations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __rowAnims: { kind: string; tag: string }[] }).__rowAnims);

const animationOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);

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
    await expect(page.getByText(`Hello, ${TEST_USER.name}`)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __viewTransitions: number }).__viewTransitions)).toBe(1);
  });

  test("a created account's confirmation fades in, and the provider buttons are gone with the form", async ({ page }) => {
    // Why: the form used to be swapped for the message in one frame. And the Google/GitHub buttons live above the form, so they must go
    // with it: "Continue with Google" over "Account created, check your email" made no sense.
    await page.goto("/register");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("New Person");
    await page.getByLabel("Email").fill("new.person@example.com");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Organization name").fill("New Org");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Account created for")).toBeVisible();
    expect(await animationOf(page, "p.motion-rise-in")).not.toBe("none");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  });

  test("logging out lands on a login page that fades and rises in, instead of popping in", async ({ loggedInPage: page }) => {
    // Why: the pages inside the app animate, but the login page had no motion at all, so logging out was an abrupt cut.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await animationOf(page, "div.motion-rise-in")).toBe("motion-rise-in");
  });

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
    await pick(combobox(page, "Filter by status"), "Todo");
    await expect(page).toHaveURL(/status=todo/);
    expect(await page.locator("div.motion-rise-in[data-probe]").count()).toBe(1);

    await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "Board" }).click();
    await expect(page).toHaveURL(/\/board$/);
    await expect(page.locator("div.motion-rise-in[data-probe]")).toHaveCount(0); // polled: the URL changes a moment before the new page is on screen
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

  test("the edit popup fades and grows in like the other dialogs", async ({ loggedInPage: page }) => {
    // Why: Edit opens a native dialog with the shared motion-dialog classes; the duration is stretched so the
    // middle of the transition can be sampled.
    const { projectId } = await createIssueViaApi(page.request, {
      projectName: "Website",
      projectKey: "WEB",
      titles: ["Edit me"],
    });
    await page.goto(`/projects/${projectId}`);
    await page.addStyleTag({ content: ":root { --motion-duration-base: 1000ms; }" });
    await page.getByRole("listitem").filter({ hasText: "Edit me" }).getByRole("button", { name: "Edit" }).click();
    const dialog = page.locator("dialog.motion-dialog[aria-label^='Edit ']");
    const opacity = () => dialog.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(await opacity()).toBeLessThan(0.9); // still fading in
    await page.waitForTimeout(1200);
    expect(await opacity()).toBe(1);
  });

  test("switching the theme runs ONE view transition (a fade between two pictures of the page), not the heavy per-element fade", async ({
    loggedInPage: page,
  }) => {
    // Why: the per-element colour fade was visibly laggy on full pages (measured: frames over 50 ms with it, none with the view transition),
    // so the preferred way must be what runs when the browser supports it, and it must run once per change.
    await countViewTransitions(page);
    await page.goto("/projects");
    await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: /Dark/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => (window as unknown as { __viewTransitions: number }).__viewTransitions)).toBe(1);
    await expect(page.locator("html")).not.toHaveClass(/motion-theme-fade/);
  });

  test("without view-transition support the colours still cross-fade: the class is on the page for a moment, then gone", async ({
    loggedInPage: page,
  }) => {
    // Why: browsers without the API must keep the old, correct behaviour instead of flipping in one frame.
    await page.addInitScript(() => {
      (document as unknown as { startViewTransition?: unknown }).startViewTransition = undefined;
    });
    await page.goto("/projects");
    await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: /Dark/i }).click();
    await expect(page.locator("html")).toHaveClass(/motion-theme-fade/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).not.toHaveClass(/motion-theme-fade/, { timeout: 2000 });
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

  test("on a wide window the issue filters do not move when the panel opens", async ({ loggedInPage: page }) => {
    // Why: the filter row only wraps clear of the panel when the window is narrow enough for them to overlap.
    // On a wide one nothing is covered, so nothing may move (the owner saw Sort drop a line).
    await page.setViewportSize({ width: 1920, height: 1000 });
    const { projectId } = await createIssueViaApi(page.request, {
      projectName: "Website",
      projectKey: "WEB",
      titles: ["Alpha"],
    });
    await page.goto(`/projects/${projectId}`);
    const sort = page.getByLabel("Sort");
    await expect(sort).toBeVisible();
    await page.waitForTimeout(400); // let the page's own fade-and-rise settle: it moves things by a few pixels
    const before = (await sort.boundingBox())!;
    await page.getByRole("link", { name: /Alpha/ }).first().click();
    await expect(page.locator('section[aria-label="Issue"]')).toBeVisible();
    await page.waitForTimeout(400);
    const after = (await sort.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(1.5);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1.5);
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

  test("a list rises in one row after another on first load, then settles", async ({ loggedInPage: page }) => {
    // Why: the owner's skeleton-to-content pick. The settle timer (1 s) is stretched so the state can be read.
    await page.addInitScript(() => {
      const original = window.setTimeout.bind(window);
      window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
        original(fn, ms === 1000 ? 20000 : ms, ...args)) as typeof window.setTimeout;
    });
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      await createIssueViaApi(page.request, { projectName: name, projectKey: name.slice(0, 3).toUpperCase(), titles: [] });
    }
    await page.goto("/projects");
    const cards = page.locator("main ul li");
    await expect(cards).toHaveCount(3);
    const info = await cards.evaluateAll((els) => els.map((el) => ({ cls: el.className.includes("motion-rise-in"), delay: (el as HTMLElement).style.animationDelay })));
    expect(info.every((i) => i.cls)).toBe(true);
    expect(info.map((i) => i.delay)).toEqual(["0ms", "40ms", "80ms"]);
  });

  test("a created row opens up with a flash; a deleted row closes up before it is removed", async ({
    loggedInPage: page,
  }) => {
    // Why: the owner's row pick (create and delete are the two moments rows change). Recorded through
    // Element.animate, so nothing here depends on timing.
    await recordRowAnimations(page);
    const { projectId } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: [] });
    await page.goto("/projects");
    await expect(page.locator("main ul li")).toHaveCount(1);
    expect(await rowAnimations(page)).toEqual([]); // the first load is not a change

    await page.getByPlaceholder("Website", { exact: true }).fill("Second");
    await page.getByPlaceholder("WEB", { exact: true }).fill("SEC");
    await page.getByRole("button", { name: /Add project/ }).click();
    await expect(page.locator("main ul li")).toHaveCount(2);
    await expect(page.locator("main ul li.motion-flash")).toHaveCount(1);
    // (React StrictMode runs an effect twice in development, so one row can start its animation twice.)
    expect((await rowAnimations(page)).filter((a) => a.kind === "enter").length).toBeGreaterThan(0);

    await page.goto(`/projects/${projectId}/sprints`);
    await page.getByPlaceholder("Sprint 1").fill("Doomed");
    await page.getByRole("button", { name: /Create sprint/ }).click();
    const row = page.getByRole("listitem").filter({ hasText: "Doomed" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete sprint" }).click();
    await expect(row).toHaveCount(0);
    expect((await rowAnimations(page)).filter((a) => a.kind === "leave").length).toBeGreaterThan(0);
  });

  test("changing a filter or loading more is not a change: no row opens or closes", async ({ loggedInPage: page }) => {
    // Why: the reset key. Without it every filter click would make the whole list close and open again.
    await recordRowAnimations(page);
    const { projectId } = await createIssueViaApi(page.request, {
      projectName: "Website",
      projectKey: "WEB",
      titles: ["One", "Two", "Three"],
    });
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole("link", { name: /Three/ }).first()).toBeVisible();
    await pick(combobox(page, "Filter by status"), "Done");
    await expect(page.getByText("No issues match these filters.")).toBeVisible();
    await pick(combobox(page, "Filter by status"), "All statuses");
    await expect(page.getByRole("link", { name: /Three/ }).first()).toBeVisible();
    expect(await rowAnimations(page)).toEqual([]);
  });

  test("a new comment opens up on the timeline", async ({ loggedInPage: page }) => {
    await recordRowAnimations(page);
    const { projectId, issueIds } = await createIssueViaApi(page.request, {
      projectName: "Website",
      projectKey: "WEB",
      titles: ["Talk"],
    });
    await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
    await expect(page.getByText("created this issue")).toBeVisible();
    expect(await rowAnimations(page)).toEqual([]);
    await page.getByPlaceholder("Add a comment…").fill("Hello there");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Hello there")).toBeVisible();
    expect((await rowAnimations(page)).some((a) => a.kind === "enter")).toBe(true);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the login page after logging out does not animate either", async ({ loggedInPage: page }) => {
    // Why: the new login transition must obey the same "less motion" setting as every other motion.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await animationOf(page, "div.motion-rise-in")).toBe("none");
  });

  test("logging in starts no view transition", async ({ page }) => {
    // Why: "reduce motion" must also mean a plain, instant change of page after a login.
    await page.request.post("/api/v1/auth/register", { data: TEST_USER });
    await countViewTransitions(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => (window as unknown as { __viewTransitions: number }).__viewTransitions)).toBe(0);
  });

  test("nothing animates: no rise-in, no theme fade", async ({ loggedInPage: page }) => {
    // Why: people who asked for less motion must get none, and nothing may wait for an animation that never runs.
    await countViewTransitions(page);
    await page.goto("/projects");
    expect(await animationOf(page, "div.motion-rise-in")).toBe("none");
    await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: /Dark/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).not.toHaveClass(/motion-theme-fade/);
    expect(await page.evaluate(() => (window as unknown as { __viewTransitions: number }).__viewTransitions)).toBe(0);
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

  test("rows appear and leave without any animation", async ({ loggedInPage: page }) => {
    await recordRowAnimations(page);
    await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: [] });
    await page.goto("/projects");
    await expect(page.locator("main ul li")).toHaveCount(1);
    await page.getByPlaceholder("Website", { exact: true }).fill("Second");
    await page.getByPlaceholder("WEB", { exact: true }).fill("SEC");
    await page.getByRole("button", { name: /Add project/ }).click();
    await expect(page.locator("main ul li")).toHaveCount(2);
    expect(await rowAnimations(page)).toEqual([]);
  });
});
