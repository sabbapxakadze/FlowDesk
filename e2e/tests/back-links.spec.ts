import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * Back links go back to where the person came from, not to a fixed page (PageHeader's `history` option). A link that always
 * went to a fixed page was wrong from My work, and a plain link that PUSHES a page made Profile -> Edit -> Back -> Back loop.
 */

test("an issue opened from My work says Back and returns there; opened straight from its address it names the project", async ({
  loggedInPage: page,
}) => {
  // Why: it always read "<- Website" and went to the project, even when you came from My work.
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Mine to do"],
  });
  const login = await page.request.post("/api/v1/auth/login", { data: { email: "e2e-user@example.com", password: "password123" } });
  const { accessToken, user, organization } = await login.json();
  const assigned = await page.request.patch(`/api/v1/organizations/${organization.id}/projects/${projectId}/issues/${issueIds[0]}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { version: 1, assigneeId: user.id },
  });
  expect(assigned.status()).toBe(200);

  await page.goto("/");
  await page.getByRole("link", { name: /Mine to do/ }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();

  // No previous page (a bookmark, a new tab): the project is named and opened instead.
  await page.goto("about:blank");
  await page.goto("/projects/WEB/issues/WEB-1");
  await expect(page.getByRole("link", { name: "Back", exact: true })).toHaveCount(0);
  await page.locator("main").getByRole("link", { name: "Website", exact: true }).first().click();
  await expect(page).toHaveURL(/\/projects\/WEB$/);
});

test("Profile -> Edit profile -> Back lands on the profile, and Back there goes to where you started, not round again", async ({
  loggedInPage: page,
}) => {
  // Why: the edit page's link used to push a new profile page, so Back from the profile returned to Edit, and so on, round and round.
  await page.goto("/members");
  await page.getByRole("navigation").getByRole("link", { name: /E2E User/ }).or(page.getByRole("link", { name: /E2E User/ }).last()).first().click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/members$/); // where we started, not /profile again
});

test("Account -> Back returns to Edit profile", async ({ loggedInPage: page }) => {
  // Why: the same loop was possible between Edit profile and Account.
  await page.goto("/profile");
  await page.getByRole("link", { name: /Account settings/ }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  // Edit profile was opened straight from its address, so it has no previous page and names its fallback instead.
  await expect(page.getByRole("link", { name: "Your profile", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back", exact: true })).toHaveCount(0);
});
