import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

test("assign a teammate: card, filters, activity, and the teammate is notified live", async ({
  loggedInPage: pageA,
  browser,
}) => {
  // Why: assignee crosses the edit form, the members list, the card, the URL
  // filter, the activity text and the notification rule (ADR 0021). The second
  // browser context is the assignee, who must hear about it without reloading.
  const { projectId, issueIds } = await createIssueViaApi(pageA.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Pass the baton", "Nobody's job"],
  });
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  await expect(pageB.getByRole("button", { name: "Notifications" })).not.toContainText(
    "1",
  );

  // A assigns the first issue to B through the edit form.
  await pageA.goto(`/projects/${projectId}`);
  const card = (title: string) => pageA.getByRole("listitem").filter({ hasText: title });
  await card("Pass the baton").getByRole("button", { name: "Edit" }).click();
  await pageA
    .locator(`select[name="assigneeId"]`)
    .selectOption({ label: "Second Person" });
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(
    card("Pass the baton").getByRole("img", { name: "Assigned to Second Person" }),
  ).toBeVisible();
  await expect(
    card("Nobody's job").getByRole("img", { name: /Assigned to/ }),
  ).toHaveCount(0);

  // B is told live (no reload): the bell count goes to 1.
  await expect(pageB.getByRole("button", { name: "Notifications" })).toContainText("1");

  // Filters on A's page, and the choice lives in the URL.
  await pageA.getByLabel("Filter by assignee").selectOption("unassigned");
  await expect(pageA).toHaveURL(/assignee=unassigned/);
  await expect(card("Nobody's job")).toBeVisible();
  await expect(card("Pass the baton")).toHaveCount(0);
  await pageA.getByLabel("Filter by assignee").selectOption({ label: "Second Person" });
  await expect(card("Pass the baton")).toBeVisible();
  await expect(card("Nobody's job")).toHaveCount(0);

  // B's "Assigned to me" shows exactly the issue assigned to B.
  await pageB.goto(`/projects/${projectId}`);
  await pageB.getByLabel("Filter by assignee").selectOption({ label: "Assigned to me" });
  await expect(
    pageB.getByRole("listitem").filter({ hasText: "Pass the baton" }),
  ).toBeVisible();
  await expect(
    pageB.getByRole("listitem").filter({ hasText: "Nobody's job" }),
  ).toHaveCount(0);

  // The activity says who, once.
  await pageA.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(pageA.getByText("assigned this issue to Second Person")).toHaveCount(1);

  // A takes it away again: the previous assignee is told live too (the bell goes
  // from 1 to 2), even though B never commented or edited anything on the issue.
  await pageA.goto(`/projects/${projectId}`);
  await card("Pass the baton").getByRole("button", { name: "Edit" }).click();
  await pageA.locator(`select[name="assigneeId"]`).selectOption({ label: "Unassigned" });
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(card("Pass the baton").getByRole("img", { name: /Assigned to/ })).toHaveCount(0);
  await expect(pageB.getByRole("button", { name: "Notifications" })).toContainText("2");

  await contextB.close();
});
