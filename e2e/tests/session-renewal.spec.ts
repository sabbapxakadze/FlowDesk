import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * Session renewal (ADR 0038). The access token lives 15 minutes and used to be renewed only when the page loaded, so a tab left
 * open then showed "Invalid or expired access token" everywhere until a reload. Now a rejected request renews the token and is
 * sent again, a tab that comes back after a while renews first, and only a session that is really gone sends the person to log in.
 *
 * Expiry is simulated at the network: requests that carry a token we marked dead are answered with the server's own 401 body.
 */

const UNAUTHENTICATED = JSON.stringify({
  error: { code: "unauthenticated", message: "Invalid or expired access token." },
});

async function watch(page: Page) {
  const dead = new Set<string>();
  let current = "";
  let rejected = 0;
  let refreshes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/auth/refresh"))
      refreshes += 1;
  });
  await page.route("**/api/v1/organizations/**", (route) => {
    const token = route.request().headers()["authorization"] ?? "";
    if (token && dead.has(token)) {
      rejected += 1;
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: UNAUTHENTICATED,
      });
    }
    current = token;
    return route.continue();
  });
  return {
    /** From now on the token the page is using is "expired". */
    // Waits out the current second: a token is signed with a time in whole seconds, so a renewal in the same second as the
    // one it replaces would be byte-for-byte the same token, and this test would then refuse the new one too. Real renewals are
    // minutes apart.
    expire: async () => {
      dead.add(current);
      await page.waitForTimeout(1100);
    },
    refreshes: () => refreshes,
    rejected: () => rejected,
  };
}

async function open(page: Page, path = "/projects/WEB") {
  await page.goto(path);
  await expect(page.getByRole("link", { name: /One/ }).first()).toBeVisible();
}

test.beforeEach(async ({ loggedInPage: page }) => {
  await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["One"],
  });
});

test("an expired token is renewed and the request sent again: the page shows its data, not an error", async ({
  loggedInPage: page,
}) => {
  // Why: this is the bug. Before, the Members page below said "Failed to load invitations: Invalid or expired access token."
  const net = await watch(page);
  await open(page);
  const before = net.refreshes();
  await net.expire();
  await page.getByRole("link", { name: "Members", exact: true }).click();
  // The member list loaded (inside the page itself: the sidebar shows the same name, and each name has a hover card, so an unscoped text match finds several).
  await expect(page.locator("main").getByRole("link", { name: "E2E User" }).first()).toBeVisible();
  await expect(page.getByText("No pending invitations.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Invalid or expired");
  await page.waitForTimeout(1500);
  expect(net.rejected()).toBeGreaterThan(0); // the old token really was refused
  expect(net.refreshes() - before).toBe(1);
});

test("several requests failing together cause exactly one renewal", async ({
  loggedInPage: page,
}) => {
  // Why: the server treats a refresh cookie used twice as theft and ends the whole session, so two renewals at once would sign the person out.
  const net = await watch(page);
  await open(page);
  const before = net.refreshes();
  await net.expire();
  await page.getByRole("link", { name: "Analytics", exact: true }).click(); // a page that asks for several things at once
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Invalid or expired");
  await page.waitForTimeout(1500); // let any renewal that was going to be sent actually be sent (they queue behind the lock)
  expect(net.rejected()).toBeGreaterThanOrEqual(2);
  expect(net.refreshes() - before).toBe(1);
});

test("two tabs expiring together both recover, and the session survives a reload", async ({
  loggedInPage: page,
}) => {
  // Why: tabs share the refresh cookie. Without a lock across tabs the second one sends the cookie the first one already spent,
  // the server sees a reuse and revokes everything, and both tabs end up signed out.
  const second = await page.context().newPage();
  const netA = await watch(page);
  const netB = await watch(second);
  await open(page);
  await open(second);
  await Promise.all([netA.expire(), netB.expire()]);
  await Promise.all([
    page.getByRole("link", { name: "Members", exact: true }).click(),
    second.getByRole("link", { name: "Members", exact: true }).click(),
  ]);
  await expect(page.getByText("No pending invitations.")).toBeVisible();
  await expect(second.getByText("No pending invitations.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Invalid or expired");
  await expect(second.locator("main")).not.toContainText("Invalid or expired");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible(); // still signed in
});

test("when the session itself is gone, the person is sent to log in and told why", async ({
  loggedInPage: page,
}) => {
  // Why: after 30 days, or a sign-out elsewhere, renewing cannot work. That is the one case where logging in again is right,
  // and it must say so instead of showing a broken page.
  const net = await watch(page);
  await open(page);
  await net.expire();
  await page.context().clearCookies(); // the refresh cookie is gone
  await page.getByRole("link", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Your session ended. Please log in again.")).toBeVisible();
});

test("a request that never reaches the server says so in plain words, not the browser's 'Failed to fetch'", async ({
  loggedInPage: page,
}) => {
  // Why: "Failed to fetch" is the browser's own text for a request with no answer. People should read what to do.
  await open(page);
  await page.route("**/api/v1/organizations/*/projects/*/issues", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
  await page.getByRole("button", { name: /New issue/ }).click();
  const dialog = page.getByRole("dialog", { name: "New issue" });
  await dialog.getByLabel("Title").fill("Will not arrive");
  await dialog.getByRole("button", { name: "Add issue" }).click();
  await expect(
    dialog.getByText("Could not reach the server. Check your connection and try again."),
  ).toBeVisible();
  await expect(dialog).not.toContainText("Failed to fetch");
});

test("coming back to a tab after a long time renews the token before anything asks for it", async ({
  loggedInPage: page,
}) => {
  // Why: a hidden tab's timers sleep, so its token may be dead on return. Renewing first means the screen's queries never fail.
  await page.clock.install();
  const net = await watch(page);
  await open(page);
  const before = net.refreshes();
  await page.clock.fastForward("12:00"); // twelve minutes: older than the 10 the app tolerates
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => net.refreshes() - before).toBe(1);
});
