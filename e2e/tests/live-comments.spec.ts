import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

test("a comment, an edit and a delete by one person show up live for another", async ({
  loggedInPage: pageA,
  browser,
}) => {
  // Why: real-time updates are only worth anything if a second person sees
  // them without reloading. Two separate browser contexts are two separate
  // people (own cookies, own socket), which is the reason this suite uses
  // Playwright. Page B never reloads after it opens the issue.
  const { projectId, issueIds } = await createIssueViaApi(pageA.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Discuss me"],
  });
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");

  const issueUrl = `/projects/${projectId}/issues/${issueIds[0]}`;
  await pageA.goto(issueUrl);
  await pageB.goto(issueUrl);
  await expect(pageB.getByRole("heading", { name: "Discuss me" })).toBeVisible();

  // Presence: A sees B (also proves both sockets joined the issue room).
  // The name is now a hoverable button inside the sentence, so check both parts.
  const viewing = pageA.locator("p", { hasText: /is also viewing/ });
  await expect(viewing).toBeVisible();
  await expect(viewing.getByRole("link", { name: "Second Person" })).toBeVisible();

  // A posts: B sees it with no reload.
  await pageA.getByRole("textbox", { name: "Comment", exact: true }).fill("Hello from A");
  await pageA.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(pageB.getByText("Hello from A")).toBeVisible();

  // A edits: B sees the new text and "(edited)".
  const commentA = pageA.locator("li", { hasText: "Hello from A" });
  await commentA.getByRole("button", { name: "Edit" }).click();
  await pageA.getByRole("textbox", { name: "Edit comment", exact: true }).fill("Hello again from A");
  await pageA.getByRole("button", { name: "Save" }).click();
  const commentB = pageB.locator("li", { hasText: "Hello again from A" });
  await expect(commentB).toBeVisible();
  await expect(commentB).toContainText("(edited)");
  await expect(pageB.getByText("Hello from A", { exact: true })).toHaveCount(0);

  // B is a plain member, so cannot edit or delete A's comment (the server
  // decides who sees the buttons).
  await expect(commentB.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(commentB.getByRole("button", { name: "Delete" })).toHaveCount(0);

  // A deletes: B sees the placeholder.
  const editedA = pageA.locator("li", { hasText: "Hello again from A" });
  await editedA.getByRole("button", { name: "Delete" }).click();
  await editedA.getByRole("button", { name: "Confirm delete" }).click();
  await expect(pageB.getByText("Comment deleted")).toBeVisible();

  await contextB.close();
});
