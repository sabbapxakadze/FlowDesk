import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

/**
 * "My work", the page `/` opens: the open issues assigned to me across projects, and my unread notifications.
 */

async function myId(page: Page) {
  const { headers, base } = await apiSession(page.request);
  const members = await (await page.request.get(`${base}/members`, { headers })).json();
  return { me: members.data[0].userId as string, headers, base };
}

async function assign(page: Page, projectId: string, issueId: string, userId: string, status?: string) {
  const { headers, base } = await apiSession(page.request);
  const res = await page.request.patch(`${base}/projects/${projectId}/issues/${issueId}`, {
    headers,
    data: { version: 1, assigneeId: userId, ...(status ? { status } : {}) },
  });
  expect(res.status()).toBe(200);
}

test("/ is My work: my open issues from every project with the project named, and not finished or other people's", async ({
  loggedInPage: page,
}) => {
  // Why: the feature. The page used to be a redirect to the project list.
  const web = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Mine in web", "Not mine", "Mine but done"] });
  const api = await createIssueViaApi(page.request, { projectName: "Backend API", projectKey: "API", titles: ["Mine in api"] });
  const { me } = await myId(page);
  await assign(page, web.projectId, web.issueIds[0]!, me);
  await assign(page, web.projectId, web.issueIds[2]!, me, "done");
  await assign(page, api.projectId, api.issueIds[0]!, me);

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/); // not redirected away
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  const assigned = page.getByRole("region", { name: "Assigned to me" });
  await expect(assigned.getByRole("heading", { name: /Assigned to me/ })).toContainText("2"); // the count
  await expect(assigned.getByRole("link", { name: /Mine in web/ })).toContainText("Website");
  await expect(assigned.getByRole("link", { name: /Mine in api/ })).toContainText("Backend API");
  await expect(assigned.getByText("Not mine")).toHaveCount(0);
  await expect(assigned.getByText("Mine but done")).toHaveCount(0);

  // A row opens the issue.
  await assigned.getByRole("link", { name: /Mine in web/ }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);
});

test("the sidebar's My work link and the logo both go to it", async ({ loggedInPage: page }) => {
  // Why: the page needs a way in now that login still lands on Projects.
  await page.goto("/projects");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "My work" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(nav.getByRole("link", { name: "My work" })).toHaveAttribute("aria-current", "page");
  await page.goto("/projects");
  await page.getByRole("link", { name: "FlowDesk" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("with nothing assigned and nothing unread, it says so", async ({ loggedInPage: page }) => {
  // Why: the empty states are the first thing a new person sees.
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Assigned to me" })).toContainText("Nothing is assigned to you");
  await expect(page.getByRole("region", { name: "Unread notifications" })).toContainText("all caught up");
});

test("a comment from someone else shows as unread here, clicking it opens the issue and clears it", async ({
  loggedInPage: owner,
  browser,
}) => {
  // Why: the notifications section is the bell's own list; reading one here must clear it in the bell too.
  const { projectId, issueIds } = await createIssueViaApi(owner.request, { projectName: "Website", projectKey: "WEB", titles: ["Needs attention"] });
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  // The owner has to take part to be notified: one comment of their own first.
  await owner.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await owner.getByPlaceholder("Add a comment…").fill("First, from the owner");
  await owner.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(owner.getByText("First, from the owner")).toBeVisible();

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await logInThroughForm(other, "e2e-second@example.com");
  await other.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await other.getByPlaceholder("Add a comment…").fill("Hello from Second");
  await other.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(other.getByText("Hello from Second")).toBeVisible();

  await owner.goto("/");
  const unread = owner.getByRole("region", { name: "Unread notifications" });
  await expect(unread.getByRole("heading", { name: /Unread notifications/ })).toContainText("1");
  const row = unread.getByRole("button", { name: /Second Person/ });
  await expect(row).toContainText("WEB-1");
  await expect(row).toContainText("Needs attention");
  await row.click();
  await expect(owner).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);

  await owner.goto("/");
  await expect(owner.getByRole("region", { name: "Unread notifications" })).toContainText("all caught up");
  await expect(owner.getByRole("button", { name: /^Notifications/ })).not.toContainText("1");
  await ctx.close();
});

test("signed out, My work is not shown: / is the public landing page (ADR 0043)", async ({ page }) => {
  // Why: My work is behind the login like every other app page. A visitor at / used to be redirected to the login page; now they
  // see the landing page instead (landing.spec.ts covers it), and still never My work.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Plan the work. Follow it through." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toHaveCount(0);
});
