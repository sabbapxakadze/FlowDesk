import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

/**
 * The full issue page (ADR 0061, the owner's pick B of three layouts): the title with Edit at its right, a properties card (status, priority, assignee, due date,
 * labels, reporter, created, updated), the description in its own card, then attachments and activity. The side panel keeps its compact layout.
 */

test("the page shows a properties card with the issue's values, and the description in its own card", async ({ loggedInPage: page }) => {
  // Why: the point of the redesign: every property has a labelled place instead of a loose row of chips.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Fix the hero image"] });
  const { headers, base } = await apiSession(page.request);
  const members = await (await page.request.get(`${base}/members`, { headers })).json();
  const me = members.data[0].userId as string;
  const patch = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, {
    headers,
    data: { version: 1, description: "It shifts the heading down.", priority: "high", assigneeId: me, dueDate: "2030-01-15" },
  });
  expect(patch.status()).toBe(200);

  await page.goto("/projects/WEB/issues/WEB-1");
  await expect(page.getByRole("heading", { level: 1, name: "Fix the hero image" })).toBeVisible();
  const properties = page.getByRole("main").locator("dl");
  for (const label of ["Status", "Priority", "Assignee", "Due", "Labels", "Reporter", "Created", "Updated"]) {
    await expect(properties.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(properties).toContainText("High");
  await expect(properties).toContainText("E2E User"); // assignee and reporter
  await expect(properties).toContainText("Jan 15, 2030");
  await expect(properties).toContainText("None"); // no labels
  await expect(page.getByRole("heading", { level: 2, name: "Description" })).toBeVisible();
  await expect(page.getByText("It shifts the heading down.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("an unassigned issue with no description and no due date says so, in the card", async ({ loggedInPage: page }) => {
  // Why: empty values must read as empty, not as a missing piece of the page.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Bare issue"] });
  await page.goto("/projects/WEB/issues/WEB-1");
  const properties = page.getByRole("main").locator("dl");
  await expect(properties).toContainText("Unassigned");
  await expect(properties).toContainText("No due date");
  await expect(page.getByText("No description.")).toBeVisible();
});

test("the side panel keeps its compact layout: no properties card", async ({ loggedInPage: page }) => {
  // Why: the redesign is for the full page only; the panel is narrow and keeps its meta row.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Panel issue"] });
  await page.goto("/projects/WEB?issue=WEB-1");
  const panel = page.getByRole("dialog", { name: "Issue", exact: true });
  await expect(panel).toContainText("Panel issue");
  await expect(panel.getByText("Reporter", { exact: true })).toHaveCount(0);
  await expect(panel.locator("dl")).toHaveCount(0);
});
