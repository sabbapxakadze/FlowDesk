import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi, createLabelViaApi, createSprintViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

test("deleting an issue asks first, removes it, and sends another viewer away live", async ({
  loggedInPage: pageA,
  browser,
}) => {
  // Why: hard delete is irreversible, so the confirmation must really gate it;
  // and a second person looking at the issue must be sent back to the list
  // (not left on a 404) without reloading. A plain member who did not report
  // the issue must not be offered the button at all.
  const { projectId, issueIds } = await createIssueViaApi(pageA.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Doomed issue", "Survivor"],
  });
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  const issueUrl = `/projects/${projectId}/issues/${issueIds[0]}`;
  const membersLoaded = pageB.waitForResponse(
    (res) => res.url().includes("/members") && res.ok(),
  );
  await pageB.goto(issueUrl);
  await membersLoaded;
  await expect(pageB.getByRole("heading", { name: "Doomed issue" })).toBeVisible();
  await expect(pageB.getByRole("button", { name: "Delete issue" })).toHaveCount(0);

  // A (the reporter) is asked first; Cancel backs out and nothing is deleted.
  await pageA.goto(issueUrl);
  await pageA.getByRole("button", { name: "Delete issue" }).click();
  await expect(pageA.getByText("permanently removed")).toBeVisible();
  await pageA.getByRole("button", { name: "Cancel" }).click();
  await expect(pageA.getByText("permanently removed")).toHaveCount(0);
  await expect(pageA.getByRole("heading", { name: "Doomed issue" })).toBeVisible();

  // Then really delete.
  await pageA.getByRole("button", { name: "Delete issue" }).click();
  await pageA
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete issue" })
    .click();
  await expect(pageA).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await expect(
    pageA.getByRole("listitem").filter({ hasText: "Doomed issue" }),
  ).toHaveCount(0);
  await expect(pageA.getByRole("listitem").filter({ hasText: "Survivor" })).toBeVisible();

  // B, who was looking at it, is sent to the project's list without a reload.
  await expect(pageB).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await pageB.goto(issueUrl);
  // A deleted issue's URL no longer works. The page shows a skeleton for about
  // 7 seconds before "not found" (a failed request is retried; a known item in
  // the Phase 8.5 small-UI-wins list), hence the longer timeout.
  await expect(pageB.getByText("Issue not found")).toBeVisible({ timeout: 15_000 });
  await contextB.close();
});

test("an owner deletes a label after confirming; a plain member is not offered it", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: deleting a label changes every issue that uses it, so it is admin-level.
  await createLabelViaApi(page.request, "bug", "#112233");
  await createLabelViaApi(page.request, "feature", "#445566");
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  const membersLoaded = pageB.waitForResponse(
    (res) => res.url().includes("/members") && res.ok(),
  );
  await pageB.goto("/labels");
  await membersLoaded;
  await expect(pageB.getByRole("button", { name: "Edit" })).toHaveCount(2);
  await expect(pageB.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await contextB.close();

  await page.goto("/labels");
  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name });
  await row("bug").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Delete the label "bug"?`)).toBeVisible();
  await page.getByRole("button", { name: "Delete label" }).click();
  await expect(row("bug")).toHaveCount(0);
  await expect(row("feature")).toBeVisible();

  await page.reload();
  await expect(row("bug")).toHaveCount(0);
});

test("a sprint can be deleted, but not while it is active", async ({
  loggedInPage: page,
}) => {
  // Why: deleting the sprint people are working in would drop the active-sprint
  // view under them, so the control is not offered for an active sprint.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["x"],
  });
  await createSprintViaApi(page.request, projectId, "Old sprint");
  await createSprintViaApi(page.request, projectId, "Live sprint");

  await page.goto(`/projects/${projectId}/sprints`);
  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name });

  // Start "Live sprint": its Delete disappears and Complete appears.
  await row("Live sprint").getByRole("button", { name: "Start" }).click();
  await expect(
    row("Live sprint").getByRole("button", { name: "Complete" }),
  ).toBeVisible();
  await expect(row("Live sprint").getByRole("button", { name: "Delete" })).toHaveCount(0);

  // "Old sprint" is deletable, after a confirmation.
  await row("Old sprint").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Delete the sprint "Old sprint"?`)).toBeVisible();
  await page.getByRole("button", { name: "Delete sprint" }).click();
  await expect(row("Old sprint")).toHaveCount(0);
  await expect(row("Live sprint")).toBeVisible();

  await page.reload();
  await expect(row("Old sprint")).toHaveCount(0);
});
