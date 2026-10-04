import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

// A real 1x1 PNG: the server decodes the upload, so it has to be a valid picture.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const sidebarPerson = (page: Page) => page.getByRole("link", { name: /E2E User|Renamed Person/ }).first();

test("editing the profile shows on the profile page, the members list and the sidebar", async ({
  loggedInPage: page,
}) => {
  // Why: the whole edit round trip through the real UI, and that one save reaches every
  // place a person is shown without logging in again.
  await page.goto("/profile");
  await page.getByLabel("Name", { exact: true }).fill("Renamed Person");
  await page.getByLabel("Job title (optional)").fill("Backend engineer");
  await page.getByLabel("About you (optional)").fill("I keep the API fast.");
  await expect(page.getByText("20 / 300")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await expect(sidebarPerson(page)).toContainText("Renamed Person");
  await sidebarPerson(page).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Renamed Person" })).toBeVisible();
  await expect(page.getByText("Backend engineer").first()).toBeVisible();
  await expect(page.getByText("I keep the API fast.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit profile" })).toBeVisible();

  await page.goto("/members");
  await expect(page.getByRole("list", { name: "Members" })).toContainText("Renamed Person");
});

test("the form refuses a too-long bio and an empty name, and says why", async ({ loggedInPage: page }) => {
  // Why: the contract's limits are shown next to the field, not only rejected by the server.
  await page.goto("/profile");
  await page.getByLabel("Name", { exact: true }).fill("");
  await page.getByLabel("About you (optional)").fill("x".repeat(301));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Name is required")).toBeVisible();
  await expect(page.getByText("About you must be at most 300 characters")).toBeVisible();
});

test("a photo can be uploaded, shows in the sidebar, and can be removed", async ({ loggedInPage: page }) => {
  // Why: the upload goes through the real file input; the server shrinks it and the sidebar
  // and profile show the stored picture; removing brings the initials back.
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
  await page.getByLabel("Photo file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1X1 });
  await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();

  const sidebarImage = page.locator('a[href^="/people/"] img');
  await expect(sidebarImage).toHaveAttribute("src", /^\/api\/v1\/avatars\/[a-f0-9]{32}$/);
  // The picture really loads (a broken one would silently fall back to initials).
  await expect.poll(() => sidebarImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(256);

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
  await expect(sidebarImage).toHaveCount(0);
});

test("a wrong file is refused with a message before anything is uploaded", async ({ loggedInPage: page }) => {
  await page.goto("/profile");
  await page.getByLabel("Photo file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText("Choose a PNG, JPEG or WebP picture.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
});

test("another member finds the profile from the hover card and sees the title and activity", async ({
  loggedInPage: page,
}) => {
  // Why: the way most people will reach a profile, and that the activity lists the issue as a
  // link that opens it in the side panel.
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Login page"],
  });
  const { headers } = await apiSession(page.request);
  expect(
    (
      await page.request.patch("/api/v1/users/me/profile", {
        headers,
        data: { name: "E2E User", jobTitle: "Team lead", bio: "Hello there" },
      })
    ).status(),
  ).toBe(204);
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });

  const ctx = await page.context().browser()!.newContext();
  const second = await ctx.newPage();
  await logInThroughForm(second, "e2e-second@example.com");
  await second.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await second.getByPlaceholder("Add a comment…").fill("From the second person");
  await second.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(second.getByText("From the second person")).toBeVisible();

  // Hover the creator's name in the timeline, then follow "View profile".
  await second.getByRole("link", { name: "E2E User" }).first().hover();
  const card = second.locator('[role="tooltip"]:visible');
  await expect(card).toContainText("Team lead");
  await card.getByRole("link", { name: "View profile" }).click();

  await expect(second).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(second.getByRole("heading", { name: "E2E User" })).toBeVisible();
  await expect(second.getByText("Team lead").first()).toBeVisible();
  await expect(second.getByText("Hello there")).toBeVisible();
  await expect(second.getByRole("link", { name: "Edit profile" })).toHaveCount(0); // not their own

  // Activity: the issue creation is a line with the issue as a link; it opens in the side panel.
  const row = second.getByRole("list", { name: "Recent activity" }).getByRole("listitem").first();
  await expect(row).toContainText("created WEB-1 Login page");
  await row.getByRole("link", { name: "WEB-1 Login page" }).click();
  await expect(second).toHaveURL(new RegExp(`/projects/${projectId}\\?issue=${issueIds[0]}`));
  await expect(second.getByRole("dialog", { name: "Issue" })).toBeVisible();
  await ctx.close();
});

test("a person who is not in the organization is 'not found'", async ({ loggedInPage: page }) => {
  await page.goto("/people/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Person not found" })).toBeVisible();
});

test("a long name and bio do not make the profile scroll sideways on a phone", async ({ loggedInPage: page }) => {
  const { headers, base } = await apiSession(page.request);
  await page.request.patch("/api/v1/users/me/profile", {
    headers,
    data: { name: "Extraordinarily".repeat(5), jobTitle: "A very long job title ".repeat(4), bio: "w".repeat(280) },
  });
  const members = await (await page.request.get(`${base}/members`, { headers })).json();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`/people/${members.data[0].userId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("clicking a person's picture (or name) in a comment goes to their profile", async ({ loggedInPage: page }) => {
  // Why: the owner asked that the picture is a way in too, not only the "View profile" link on the card.
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Click through"],
  });
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await page.getByPlaceholder("Add a comment…").fill("Look at me");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const header = page.locator("li", { hasText: "Look at me" });
  await header.getByRole("img", { name: "E2E User" }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "E2E User" })).toBeVisible();

  await page.goBack();
  await header.getByRole("link", { name: "E2E User" }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
});

test("the card's own picture and name lead to the profile, and so do the Members page picture and name", async ({
  loggedInPage: page,
}) => {
  // Why: the owner's rule that every picture and name of a person is a way in, including inside the preview card.
  await page.goto("/members");
  const row = page.getByRole("list", { name: "Members" }).getByRole("listitem").first();
  await row.getByRole("img", { name: "E2E User" }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

  await page.goto("/members");
  await row.getByRole("link", { name: "E2E User" }).last().click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

  // Inside the hover card: its picture-and-name block is a link too.
  await page.goto("/members");
  await row.getByRole("link", { name: "E2E User" }).last().hover();
  const card = page.locator('[role="tooltip"]:visible');
  await expect(card).toBeVisible();
  await card.getByRole("img", { name: "E2E User" }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
});

test('the "Finish your profile" card shows to a new person, "Not now" hides it for good, and it survives a reload', async ({
  loggedInPage: page,
}) => {
  // Why: dismissal is stored on the account, not the page, so a reload (a fresh load of
  // everything) must still not show it.
  await page.goto("/projects");
  const card = page.getByRole("region", { name: "Finish your profile" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('"Add photo" opens the edit page, and a photo makes the card go away', async ({ loggedInPage: page }) => {
  await page.goto("/projects");
  const card = page.getByRole("region", { name: "Finish your profile" });
  await card.getByRole("link", { name: "Add photo" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel("Photo file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1X1 });
  await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test("the back link on a profile goes back to where you came from, and to Members only when there is no previous page", async ({
  loggedInPage: page,
}) => {
  // Why: it always went to Members, a page you may never have visited (say you came from a comment).
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Where was I"],
  });
  const issueUrl = `/projects/${projectId}/issues/${issueIds[0]}`;
  await page.goto(issueUrl);
  await page.getByPlaceholder("Add a comment…").fill("Hello");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const header = page.locator("li", { hasText: "Hello" });
  await header.getByRole("link", { name: "E2E User" }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${issueUrl}$`));

  // A profile opened straight from its address (a bookmark, a new tab) has no previous page.
  await header.getByRole("link", { name: "E2E User" }).click();
  const profileUrl = page.url();
  await page.goto("about:blank");
  await page.goto(profileUrl);
  const fallback = page.getByRole("link", { name: "Members", exact: true }).first();
  await expect(fallback).toBeVisible();
  await expect(page.getByRole("link", { name: "Back", exact: true })).toHaveCount(0);
  await page.locator("main").getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/\/members$/);
});
