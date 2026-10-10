import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

/**
 * The Projects page (ADR 0059): a card per project with its numbers, and "New project" as a popup for owners and admins.
 */

const day = async (page: Page, days = 0) => {
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA").format(new Date()));
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test("a card shows how much is done, the open, in progress and overdue counts, and the running sprint", async ({ loggedInPage: page }) => {
  // Why: the point of the page. One issue is finished, one in progress, one late, one plain; the card must say 1 of 4 done, 3 open, 1 in progress, 1 overdue.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website Redesign", projectKey: "WEB", titles: ["Plain", "Late", "Working", "Finished"] });
  const { headers, base } = await apiSession(page.request);
  const patch = async (id: string, data: Record<string, unknown>) => {
    const res = await page.request.patch(`${base}/projects/${projectId}/issues/${id}`, { headers, data: { version: 1, ...data } });
    expect(res.status()).toBe(200);
  };
  await patch(issueIds[1]!, { dueDate: await day(page, -2) });
  await patch(issueIds[2]!, { status: "in_progress" });
  await patch(issueIds[3]!, { status: "done" });
  const sprint = (await (await page.request.post(`${base}/projects/${projectId}/sprints`, { headers, data: { name: "Sprint 7", endDate: await day(page, 4) } })).json()).data;
  expect((await page.request.patch(`${base}/projects/${projectId}/sprints/${sprint.id}/start`, { headers, data: { version: sprint.version } })).status()).toBe(200);

  await page.goto("/projects");
  const card = page.getByRole("main").getByRole("link", { name: /Website Redesign/ });
  await expect(card).toContainText("1 of 4 done");
  await expect(card).toContainText("25%");
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  await expect(card).toContainText("3 open");
  await expect(card).toContainText("1 in progress");
  await expect(card).toContainText("1 overdue");
  await expect(card).toContainText("Sprint 7");
  await expect(card).toContainText("4 days left");
  await expect(card).toContainText("WR"); // the tile's initials
  await card.click();
  await expect(page).toHaveURL(/\/projects\/WEB$/);
});

test("a project with no issues says so, and has no sprint", async ({ loggedInPage: page }) => {
  // Why: a new project must still get a card, not vanish or show a bar at 0 of 0.
  await createIssueViaApi(page.request, { projectName: "Empty One", projectKey: "EMP", titles: [] });
  await page.goto("/projects");
  const card = page.getByRole("main").getByRole("link", { name: /Empty One/ });
  await expect(card).toContainText("No issues yet");
  await expect(card).toContainText("No active sprint");
  await expect(card.getByRole("progressbar")).toHaveCount(0);
});

test("New project opens a popup: an empty name is refused, Add project creates it and closes, Cancel closes without creating", async ({ loggedInPage: page }) => {
  // Why: the inline form is gone; the popup must refuse bad input at once, create, close and show the new card, and be easy to drop.
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  // Fields are found by placeholder: once an error shows, its text is part of the field's label.
  await dialog.getByRole("button", { name: "Add project" }).click();
  await expect(dialog.getByText("Name is required")).toBeVisible();
  await dialog.getByPlaceholder("Website", { exact: true }).fill("Second Project");
  await dialog.getByPlaceholder("WEB", { exact: true }).fill("sec");
  await dialog.getByRole("button", { name: "Add project" }).click();
  await expect(dialog).toHaveCount(0);
  const card = page.getByRole("main").getByRole("link", { name: /Second Project/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("SEC");
  await expect(card).toContainText("SP");
  await expect(card).toContainText("No issues yet");

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("dialog", { name: "New project" }).getByPlaceholder("Website", { exact: true }).fill("Never Made");
  await page.getByRole("dialog", { name: "New project" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "New project" })).toHaveCount(0);
  await expect(page.getByText("Never Made")).toHaveCount(0);
});

test("a plain member sees the projects but no New project button", async ({ loggedInPage: owner, browser }) => {
  // Why: creating a project is owner and admin only (the API refuses anyone else); the page must not offer a button that can only fail.
  await createIssueViaApi(owner.request, { projectName: "Website", projectKey: "WEB", titles: [] });
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await logInThroughForm(member, "e2e-second@example.com");
  await member.goto("/projects");
  await expect(member.getByRole("main").getByRole("link", { name: /Website/ })).toBeVisible();
  await expect(member.getByRole("button", { name: "New project" })).toHaveCount(0);
  await ctx.close();
});
