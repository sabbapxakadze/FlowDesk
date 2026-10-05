import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

/**
 * Label pills on the board and sprints cards (they were only on the issue list). The same pills as the list: up to three,
 * "+n" for the rest, nothing for an issue without labels; here they are plain (the cards are drag handles and links, so a
 * pill is not a button).
 */

async function setup(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Bug and design", "Four labels", "No labels"],
  });
  const { headers, base } = await apiSession(page.request);
  const makeLabel = async (name: string, color: string) =>
    (await (await page.request.post(`${base}/labels`, { headers, data: { name, color } })).json()).data.id as string;
  const attach = async (issueId: string, labelId: string) => {
    const res = await page.request.post(`${base}/projects/${projectId}/issues/${issueId}/labels`, { headers, data: { labelId } });
    expect(res.status()).toBe(201);
  };
  const ids = [await makeLabel("bug", "#b91c1c"), await makeLabel("design", "#6d28d9"), await makeLabel("tech-debt", "#475569"), await makeLabel("docs", "#15803d")];
  await attach(issueIds[0]!, ids[0]!);
  await attach(issueIds[0]!, ids[1]!);
  for (const id of ids) await attach(issueIds[1]!, id);
}

const card = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });

test("board cards show their label pills (three, then +n), and none for an unlabeled issue", async ({ loggedInPage: page }) => {
  // Why: the board used to show no labels at all, so a card's category was invisible without opening it.
  await setup(page);
  await page.goto("/projects/WEB/board");
  const both = card(page, "Bug and design");
  await expect(both).toContainText("bug");
  await expect(both).toContainText("design");
  const four = card(page, "Four labels");
  await expect(four).toContainText("+1"); // the fourth label is counted, not drawn
  await expect(card(page, "No labels")).not.toContainText("bug");
  await expect(four.getByRole("button", { name: /Filter by label/ })).toHaveCount(0); // plain pills, not buttons
});

test("the sprints page backlog cards show their label pills too", async ({ loggedInPage: page }) => {
  // Why: the backlog is where issues are groomed, and it showed no labels either.
  await setup(page);
  await page.goto("/projects/WEB/sprints");
  await expect(card(page, "Bug and design")).toContainText("bug");
  await expect(card(page, "Four labels")).toContainText("+1");
  await expect(card(page, "No labels")).not.toContainText("bug");
});
