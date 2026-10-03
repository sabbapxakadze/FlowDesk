import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi, setIssuePriorityViaApi } from "../support/api";

const RANK = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 } as const;
type Priority = keyof typeof RANK;

/** The issue titles in the order the list shows them. */
const titlesOf = (page: Page) =>
  page.locator('ul > li a[href*="/issues/"] p.font-medium').allInnerTexts().then((texts) => texts.map((t) => t.trim()));

test("sorting by priority puts the most urgent first, newest first within a priority; the choice is in the URL and survives a reload", async ({
  loggedInPage: page,
}) => {
  // Why: the feature end to end in the real UI. Titles carry their priority so the
  // expectation reads like English; creation order is the order of the array below.
  const issues: { title: string; priority: Priority }[] = [
    { title: "Low one", priority: "low" },
    { title: "Urgent one", priority: "urgent" },
    { title: "Unranked", priority: "none" },
    { title: "High one", priority: "high" },
    { title: "Medium one", priority: "medium" },
    { title: "Urgent two", priority: "urgent" },
  ];
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: issues.map((i) => i.title),
  });
  for (const [index, issue] of issues.entries()) {
    if (issue.priority !== "none") await setIssuePriorityViaApi(page.request, projectId, issueIds[index]!, issue.priority);
  }

  await page.goto(`/projects/${projectId}`);
  const sort = page.getByLabel("Sort");
  await expect(sort).toHaveValue("newest");
  const titleOf = () => titlesOf(page);

  // Default: newest first by creation time.
  await expect.poll(titleOf).toEqual(["Urgent two", "Medium one", "High one", "Unranked", "Urgent one", "Low one"]);

  await sort.selectOption({ label: "Highest priority first" });
  await expect(page).toHaveURL(/sort=priority/);
  await expect(page).not.toHaveURL(/order=/);
  await expect.poll(titleOf).toEqual(["Urgent two", "Urgent one", "High one", "Medium one", "Low one", "Unranked"]);

  await page.reload();
  await expect(sort).toHaveValue("priority");
  await expect.poll(titleOf).toEqual(["Urgent two", "Urgent one", "High one", "Medium one", "Low one", "Unranked"]);

  await sort.selectOption({ label: "Oldest first" });
  await expect(page).toHaveURL(/order=asc/);
  await expect(page).not.toHaveURL(/sort=/);
  await expect.poll(titleOf).toEqual(["Low one", "Urgent one", "Unranked", "High one", "Medium one", "Urgent two"]);

  await sort.selectOption({ label: "Newest first" });
  await expect(page).not.toHaveURL(/sort=|order=/);
  await expect.poll(titleOf).toEqual(["Urgent two", "Medium one", "High one", "Unranked", "Urgent one", "Low one"]);
});

test("Load more continues the priority order across pages with nothing skipped or repeated, and the filters combine with it", async ({
  loggedInPage: page,
}) => {
  // Why: more than one page (25) of issues, so the cursor is exercised through the real UI.
  const priorities: Priority[] = ["none", "low", "medium", "high", "urgent"];
  const titles = Array.from({ length: 32 }, (_, i) => `Issue ${String(i + 1).padStart(2, "0")}`);
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles,
  });
  const priorityOf = (i: number) => priorities[i % 5]!;
  for (let i = 0; i < titles.length; i++) {
    if (priorityOf(i) !== "none") await setIssuePriorityViaApi(page.request, projectId, issueIds[i]!, priorityOf(i));
  }
  // Highest priority first; within a priority, newest (= highest index) first.
  const expected = titles
    .map((title, i) => ({ title, rank: RANK[priorityOf(i)], i }))
    .sort((a, b) => b.rank - a.rank || b.i - a.i)
    .map((x) => x.title);

  await page.goto(`/projects/${projectId}?sort=priority`);
  const titleOf = () => titlesOf(page);
  await expect.poll(async () => (await titleOf()).length).toBe(25); // the first page
  await page.getByRole("button", { name: "Load more" }).click();
  await expect.poll(async () => (await titleOf()).length).toBe(32);
  const all = await titleOf();
  expect(new Set(all).size).toBe(32);
  expect(all).toEqual(expected);

  // Combined with a filter: only the urgent ones, still newest first.
  await page.goto(`/projects/${projectId}?sort=priority&priority=urgent`);
  const urgent = titles.filter((_, i) => priorityOf(i) === "urgent").reverse();
  await expect.poll(titleOf).toEqual(urgent);
});
