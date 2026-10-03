import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm, TEST_USER } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

const SECOND = { email: "e2e-second@example.com", name: "Second Person" };
const memberRow = (page: Page, name: string) =>
  page.getByRole("list", { name: "Members", exact: true }).getByRole("listitem").filter({ hasText: name });

async function openMembersWithSecond(page: Page) {
  await addOrgMember(TEST_USER.email, SECOND);
  await page.goto("/members");
  await expect(memberRow(page, SECOND.name)).toBeVisible();
}

test("an owner changes a member role from the list and it sticks after a reload; the owner row and your own row have no controls", async ({
  loggedInPage: page,
}) => {
  // Why: the role dropdown must really change the role (not just the label) and the
  // rules (ADR 0024) must show in the UI: nobody is offered controls on the owner or on themselves.
  await openMembersWithSecond(page);
  const row = memberRow(page, SECOND.name);
  await expect(row).toContainText("Member");
  await row.getByLabel(`Role of ${SECOND.name}`).selectOption({ label: "Admin" });
  await expect(row.getByLabel(`Role of ${SECOND.name}`)).toHaveValue("admin");

  await page.reload();
  await expect(memberRow(page, SECOND.name).getByLabel(`Role of ${SECOND.name}`)).toHaveValue("admin");

  // Your own row (the owner) has no controls.
  await expect(memberRow(page, TEST_USER.name).getByRole("combobox")).toHaveCount(0);
  await expect(memberRow(page, TEST_USER.name).getByRole("button", { name: "Remove" })).toHaveCount(0);
});

test("an admin sees controls for members but none on the owner or on themselves", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: an admin can manage members but the owner is protected; the UI must not offer it.
  await openMembersWithSecond(page);
  await memberRow(page, SECOND.name).getByLabel(`Role of ${SECOND.name}`).selectOption({ label: "Admin" });
  await expect(memberRow(page, SECOND.name).getByLabel(`Role of ${SECOND.name}`)).toHaveValue("admin");

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await logInThroughForm(admin, SECOND.email);
  await admin.goto("/members");
  await expect(memberRow(admin, TEST_USER.name)).toBeVisible();
  await expect(memberRow(admin, TEST_USER.name).getByRole("combobox")).toHaveCount(0);
  await expect(memberRow(admin, TEST_USER.name).getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(memberRow(admin, SECOND.name).getByRole("button", { name: "Remove" })).toHaveCount(0);
  await ctx.close();
});

test("removing a member asks first, unassigns their issues, and they see a clear message when they try to log in", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: the whole removal journey. Cancel must back out; confirming must remove the
  // person, unassign their issue (visible on the issue page, with the reason) and turn
  // their next login into a plain explanation instead of an error.
  await addOrgMember(TEST_USER.email, SECOND);
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Held by Second"],
  });
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("listitem").filter({ hasText: "Held by Second" }).getByRole("button", { name: "Edit" }).click();
  await page.locator(`select[name="assigneeId"]`).selectOption({ label: SECOND.name });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("img", { name: `Assigned to ${SECOND.name}` })).toBeVisible();

  await page.goto("/members");
  const row = memberRow(page, SECOND.name);
  await row.getByRole("button", { name: "Remove" }).click();
  const dialog = row.getByRole("alertdialog");
  await expect(dialog).toContainText("become unassigned");
  await expect(dialog).toContainText("Their comments and history stay");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Remove" }).click();
  await row.getByRole("button", { name: `Remove ${SECOND.name}` }).click();
  await expect(memberRow(page, SECOND.name)).toHaveCount(0);

  // The issue is unassigned, and the timeline says why.
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(
    page.getByText("unassigned this issue (their assignee was removed from the organization)"),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("img", { name: /Assigned to/ })).toHaveCount(0);

  // The removed person can no longer log in, and is told what to do.
  const ctx = await browser.newContext();
  const gone = await ctx.newPage();
  await gone.goto("/login");
  await gone.getByLabel("Email").fill(SECOND.email);
  await gone.getByLabel("Password").fill(TEST_USER.password);
  await gone.getByRole("button", { name: "Log in" }).click();
  await expect(gone.getByText("not a member of any organization")).toBeVisible();
  await expect(gone.getByText("Ask an owner to invite you again")).toBeVisible();
  await expect(gone).toHaveURL(/\/login$/);
  await ctx.close();
});

test("a removed person is invited back, joins with one click (no new password) and logs in again", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: removal is not a dead end (ADR 0024). The invitation to an account without an
  // organization must say 'invited you back', ask for nothing, and work.
  await openMembersWithSecond(page);
  const row = memberRow(page, SECOND.name);
  await row.getByRole("button", { name: "Remove" }).click();
  await row.getByRole("button", { name: `Remove ${SECOND.name}` }).click();
  await expect(memberRow(page, SECOND.name)).toHaveCount(0);

  await page.getByLabel("Email").fill(SECOND.email);
  await page.locator(`select[name="role"]`).selectOption({ label: "Viewer" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  const url = await page.getByLabel("Invitation link").inputValue();

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(url);
  await expect(guest.getByText("invited you back")).toBeVisible();
  await expect(guest.getByLabel("Password")).toHaveCount(0);
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByText(`Welcome to ${TEST_USER.organizationName}`)).toBeVisible();

  await logInThroughForm(guest, SECOND.email);
  await guest.goto("/members");
  await expect(memberRow(guest, SECOND.name)).toContainText("Viewer");
  await ctx.close();
});

test("re-sending shows a new link once and the old link stops working", async ({ loggedInPage: page, browser }) => {
  // Why: the new link must survive the list refetch that a re-send triggers (the row
  // gets a new id), there must still be exactly one pending row, and the old link must die.
  await page.goto("/members");
  await page.getByLabel("Email").fill("later@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();
  const oldUrl = await page.getByLabel("Invitation link").inputValue();
  await page.getByRole("button", { name: "Invite someone else" }).click();

  const pendingList = page.getByRole("list", { name: "Pending invitations" });
  const pending = pendingList.getByRole("listitem").filter({ hasText: "later@example.com" });
  await pending.getByRole("button", { name: "Re-send" }).click();
  const newLink = pending.getByLabel("New invitation link for later@example.com");
  await expect(newLink).toBeVisible();
  const newUrl = await newLink.inputValue();
  expect(newUrl).not.toBe(oldUrl);
  await page.waitForTimeout(800);
  await expect(newLink).toBeVisible();
  await expect(pendingList.getByRole("listitem")).toHaveCount(1);

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(oldUrl);
  await expect(guest.getByText("This invitation is invalid or has expired.")).toBeVisible();
  await guest.goto(newUrl);
  await expect(guest.getByText("invited you to join")).toBeVisible();
  await ctx.close();
});
