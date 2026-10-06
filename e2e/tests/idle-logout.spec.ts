import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * Inactivity logout (ADR 0038): after 30 minutes without the person's own input a dialog warns for 60 seconds, then the session
 * ends and the login page says why. Time is moved with Playwright's clock, so nothing here really waits.
 */

test.beforeEach(async ({ loggedInPage: page }) => {
  await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["One"],
  });
  await page.clock.install();
  await page.goto("/projects/WEB");
  await expect(page.getByRole("link", { name: /One/ }).first()).toBeVisible();
});

const dialog = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: "Still there?" });

test("after the idle limit a dialog warns with a countdown, and Stay signed in keeps the session and restarts the timer", async ({
  loggedInPage: page,
}) => {
  // Why: the warning is the whole point; it must show up, and a person who is still there must be able to wave it away for good.
  await expect(dialog(page)).toHaveCount(0);
  await page.clock.fastForward("30:05");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText(/signed out in \d+ seconds?/);

  await dialog(page).getByRole("button", { name: "Stay signed in" }).click();
  await expect(dialog(page)).toHaveCount(0);

  await page.clock.fastForward("29:00"); // a fresh 30 minutes: not yet
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /One/ }).first()).toBeVisible(); // still signed in
});

test("ignoring the warning signs the person out and the login page says it was for inactivity", async ({
  loggedInPage: page,
}) => {
  // Why: the session must really end (also on the server, so a reload cannot bring it back), and the person must be told why.
  await page.clock.fastForward("30:05");
  await expect(dialog(page)).toBeVisible();
  await page.clock.fastForward("00:30");
  await expect(dialog(page)).toBeVisible(); // 35 of the 60 seconds are gone: still warning
  await page.clock.fastForward("00:40");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("You were signed out because of inactivity."),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/login$/); // the refresh cookie was revoked: no silent sign-in
});

test("doing something before the limit keeps the warning away", async ({
  loggedInPage: page,
}) => {
  // Why: the timer must measure inactivity, not time since login. A person who is working must never see the dialog.
  await page.clock.fastForward("29:00");
  await page.keyboard.press("a"); // the person's own input
  await page.clock.fastForward("29:00"); // 58 minutes since login, but only 29 since the last input
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /One/ }).first()).toBeVisible();
});
