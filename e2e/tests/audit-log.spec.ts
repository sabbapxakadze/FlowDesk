import { test, expect, logInThroughForm } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

const rows = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Audit log" }).getByRole("listitem");

test("the log lists what happened, newest first, in plain sentences, and keeps deleted things by name", async ({
  loggedInPage: page,
}) => {
  // Why: the feature end to end. Actions are done through the real API (the same routes the UI
  // uses); the page must turn the stored rows into readable sentences, newest first, and still
  // describe a project and an issue that no longer exist.
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Doomed issue", "Survivor"],
  });
  const { headers, base } = await apiSession(page.request);
  const projectUrl = `${base}/projects/${projectId}`;
  expect((await page.request.patch(projectUrl, { headers, data: { name: "Marketing site" } })).status()).toBe(200);
  expect((await page.request.delete(`${projectUrl}/issues/${issueIds[0]}`, { headers })).status()).toBe(204);
  expect(
    (await page.request.delete(projectUrl, { headers, data: { confirmName: "Marketing site" } })).status(),
  ).toBe(204);

  await page.goto("/audit-log");
  await expect(rows(page)).toHaveCount(4);
  // Newest first.
  await expect(rows(page).nth(0)).toContainText('E2E User deleted the project "Marketing site" and its 1 issue', { useInnerText: true });
  await expect(rows(page).nth(1)).toContainText("E2E User deleted the issue WEB-1 Doomed issue in Marketing site", { useInnerText: true });
  await expect(rows(page).nth(2)).toContainText('E2E User renamed the project "Website" to "Marketing site"', { useInnerText: true });
  await expect(rows(page).nth(3)).toContainText('E2E User created the project "Website"', { useInnerText: true });
  // Each row carries a time (with the exact moment on hover).
  await expect(rows(page).nth(0).locator("time")).toHaveCount(1);
});

test("filter by kind and by person; the choice is in the URL and survives a reload", async ({
  loggedInPage: page,
}) => {
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["One"] });
  const { headers, base } = await apiSession(page.request);
  // A member-related row by the owner, and a project row by the second person.
  await page.request.post(`${base}/invitations`, { headers, data: { email: "new@example.com", role: "member" } });

  const second = await page.context().browser()!.newContext();
  const secondPage = await second.newPage();
  await logInThroughForm(secondPage, "e2e-second@example.com");

  await page.goto("/audit-log");
  await expect(rows(page)).toHaveCount(2); // project created, invited
  await page.getByLabel("Filter by kind").selectOption({ label: "Members" });
  await expect(page).toHaveURL(/kind=member/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("invited new@example.com to join as member", { useInnerText: true });

  await page.reload();
  await expect(page.getByLabel("Filter by kind")).toHaveValue("member");
  await expect(rows(page)).toHaveCount(1);

  await page.getByLabel("Filter by kind").selectOption({ label: "Everything" });
  await page.getByLabel("Filter by person").selectOption({ label: "Second Person" });
  await expect(page).toHaveURL(/actor=/);
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible(); // they did nothing yet
  await second.close();
});

test("Load more continues the log with nothing repeated", async ({ loggedInPage: page }) => {
  // Why: more than one page (25 rows) through the real UI.
  await createIssueViaApi(page.request, { projectName: "First", projectKey: "AAA", titles: [] });
  const { headers, base } = await apiSession(page.request);
  for (let i = 0; i < 29; i++) {
    const res = await page.request.post(`${base}/projects`, { headers, data: { name: `Project ${i}`, key: `P${String(i).padStart(2, "0")}X` } });
    expect(res.status()).toBe(201);
  }
  await page.goto("/audit-log");
  await expect(rows(page)).toHaveCount(25);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(rows(page)).toHaveCount(30);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  const texts = await rows(page).allInnerTexts();
  expect(new Set(texts.map((t) => t.split("\n")[0])).size).toBe(30); // all different sentences
});

test("members never see the log: no sidebar link, and the page explains instead of listing", async ({
  loggedInPage: page,
}) => {
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  await createIssueViaApi(page.request, { projectName: "Secret", projectKey: "SEC", titles: [] });

  // The owner has the link and it works.
  await page.goto("/projects");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Audit log" }).click();
  await expect(page).toHaveURL(/\/audit-log$/);
  await expect(rows(page).first()).toContainText('created the project "Secret"', { useInnerText: true });

  // A plain member does not.
  const ctx = await page.context().browser()!.newContext();
  const member = await ctx.newPage();
  await logInThroughForm(member, "e2e-second@example.com");
  await expect(member.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Members" })).toBeVisible();
  await expect(member.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Audit log" })).toHaveCount(0);
  await member.goto("/audit-log");
  await expect(member.getByText("Only owners and admins can see the audit log.")).toBeVisible();
  // The project's NAME is visible to every member in the sidebar; what they must not see is the log.
  await expect(member.getByText('created the project "Secret"')).toHaveCount(0);
  await expect(member.getByRole("list", { name: "Audit log" })).toHaveCount(0);
  await ctx.close();
});

test("on a phone-sized screen the log does not scroll sideways", async ({ loggedInPage: page }) => {
  await createIssueViaApi(page.request, {
    projectName: "A project with a rather long name to test wrapping",
    projectKey: "LONG",
    titles: [],
  });
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto("/audit-log");
  await expect(rows(page).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
