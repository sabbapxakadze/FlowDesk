import type { Locator } from "@playwright/test";
import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

/**
 * The issue timeline shows the newest entry first and the comment box sits above it. The API still sends
 * events oldest first; only the screen order changes. Positions are compared on screen (y), not DOM order,
 * so the test checks what a person sees.
 */

const top = async (locator: Locator) => (await locator.boundingBox())!.y;

test("newest comment is on top, the first event is at the bottom, and the box is above both", async ({
  loggedInPage: page,
}) => {
  // Why: this is the feature itself, on the full issue page.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Order me"] });
  await page.goto("/projects/WEB/issues/WEB-1");
  const box = page.getByRole("textbox", { name: "Comment", exact: true });
  await expect(box).toBeVisible();

  for (const text of ["First note", "Second note", "Third note"]) {
    await box.fill(text);
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.locator("li", { hasText: text })).toBeVisible();
  }

  const first = page.locator("li", { hasText: "First note" });
  const second = page.locator("li", { hasText: "Second note" });
  const third = page.locator("li", { hasText: "Third note" });
  const created = page.getByText(/created/i).last();

  expect(await top(box)).toBeLessThan(await top(third));
  expect(await top(third)).toBeLessThan(await top(second));
  expect(await top(second)).toBeLessThan(await top(first));
  expect(await top(first)).toBeLessThan(await top(created));
});

test("a comment posted live by someone else appears at the top, in the side panel too", async ({
  loggedInPage: pageA,
  browser,
}) => {
  // Why: live arrivals go through the animated list, which is where an order bug would hide.
  await createIssueViaApi(pageA.request, { projectName: "Website", projectKey: "WEB", titles: ["Live order"] });
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");

  await pageA.goto("/projects/WEB?issue=WEB-1");
  await pageB.goto("/projects/WEB/issues/WEB-1");
  const panel = pageA.locator('section[aria-label="Issue"]');
  await expect(panel.getByRole("textbox", { name: "Comment", exact: true })).toBeVisible();

  for (const text of ["Older from B", "Newer from B"]) {
    await pageB.getByRole("textbox", { name: "Comment", exact: true }).fill(text);
    await pageB.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(panel.locator("li", { hasText: text })).toBeVisible();
  }

  const older = panel.locator("li", { hasText: "Older from B" });
  const newer = panel.locator("li", { hasText: "Newer from B" });
  expect(await top(panel.getByRole("textbox", { name: "Comment", exact: true }))).toBeLessThan(await top(newer));
  expect(await top(newer)).toBeLessThan(await top(older));

  await contextB.close();
});
