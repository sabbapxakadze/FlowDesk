import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { combobox, editor } from "../support/dropdown";

/**
 * Labels on the issue cards, and the label filter: click a pill or choose labels in the dropdown, several at once; an issue
 * must have ALL the chosen labels.
 */

async function setup(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Bug and design", "Only bug", "Four labels", "No labels"],
  });
  const { headers, base } = await apiSession(page.request);
  const makeLabel = async (name: string, color: string) =>
    (await (await page.request.post(`${base}/labels`, { headers, data: { name, color } })).json()).data.id as string;
  const attach = async (issueId: string, labelId: string) => {
    const res = await page.request.post(`${base}/projects/${projectId}/issues/${issueId}/labels`, { headers, data: { labelId } });
    expect(res.status()).toBe(201);
  };
  const bug = await makeLabel("bug", "#b91c1c");
  const design = await makeLabel("design", "#6d28d9");
  const debt = await makeLabel("tech-debt", "#475569");
  const docs = await makeLabel("docs", "#15803d");
  await attach(issueIds[0]!, bug);
  await attach(issueIds[0]!, design);
  await attach(issueIds[1]!, bug);
  for (const id of [bug, design, debt, docs]) await attach(issueIds[2]!, id);
  return { projectId, issueIds, bug, design, debt, docs };
}

const card = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
const visibleTitles = async (page: Page) =>
  (await page.locator('ul > li a[href*="/issues/"] p.font-medium').allInnerTexts()).map((t) => t.trim()).sort();
const pill = (scope: Page | ReturnType<typeof card>, name: string) => scope.getByRole("button", { name: `Filter by label ${name}` });

test("cards show up to three label pills and +n for the rest; an issue without labels shows none", async ({ loggedInPage: page }) => {
  // Why: the labels used to be invisible in the list.
  await setup(page);
  await page.goto("/projects/WEB");
  await expect(card(page, "Bug and design").getByRole("button", { name: /Filter by label/ })).toHaveCount(2);
  const four = card(page, "Four labels");
  await expect(four.getByRole("button", { name: /Filter by label/ })).toHaveCount(3); // the first three by name
  await expect(four).toContainText("+1");
  await expect(card(page, "No labels").getByRole("button", { name: /Filter by label/ })).toHaveCount(0);
});

test("clicking a pill filters the list to that label; a second pill narrows it to issues with both; clicking again removes it", async ({
  loggedInPage: page,
}) => {
  // Why: the owner's design A, with several labels at once: an issue must have ALL of them.
  const { bug, design } = await setup(page);
  await page.goto("/projects/WEB");

  await pill(card(page, "Only bug"), "bug").click();
  await expect(page).toHaveURL(new RegExp(`label=${bug}`));
  await expect.poll(() => visibleTitles(page)).toEqual(["Bug and design", "Four labels", "Only bug"]);
  await expect(pill(card(page, "Only bug"), "bug")).toHaveAttribute("aria-pressed", "true"); // the chosen pill is marked

  await pill(card(page, "Bug and design"), "design").click();
  await expect(page).toHaveURL(new RegExp(`label=${design}`));
  await expect.poll(() => visibleTitles(page)).toEqual(["Bug and design", "Four labels"]); // both labels

  await pill(card(page, "Bug and design"), "bug").click(); // toggle bug off
  await expect.poll(() => visibleTitles(page)).toEqual(["Bug and design", "Four labels"]); // design alone: the same two
  await expect(page).not.toHaveURL(new RegExp(`label=${bug}`));
});

test("the label dropdown picks several at once, stays open, summarises the choice, and Clear selection empties it", async ({
  loggedInPage: page,
}) => {
  // Why: the multi-select mode of the dropdown, in the real filter row.
  const { bug, design } = await setup(page);
  await page.goto("/projects/WEB");
  const box = combobox(page, "Filter by label");
  await expect(box).toHaveAttribute("data-value", "");

  await box.click();
  await page.getByRole("option", { name: "bug", exact: true }).click();
  await expect(page.getByRole("listbox")).toBeVisible(); // still open
  await page.getByRole("option", { name: "design", exact: true }).click();
  await expect(page.getByRole("option", { name: "bug", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "docs", exact: true })).toHaveAttribute("aria-selected", "false");
  await expect(box).toHaveAttribute("data-value", `${bug},${design}`);
  await expect(box).toContainText("bug"); // the summary
  await expect(box).toContainText("+1");
  await expect.poll(() => visibleTitles(page)).toEqual(["Bug and design", "Four labels"]);

  await page.getByRole("button", { name: /Clear selection/ }).click();
  await expect(box).toHaveAttribute("data-value", "");
  await expect(page).not.toHaveURL(/label=/);
  await expect.poll(() => visibleTitles(page)).toEqual(["Bug and design", "Four labels", "No labels", "Only bug"]);
});

test("the filter is in the address, survives a reload, and a nonsense label in the address is ignored", async ({ loggedInPage: page }) => {
  // Why: like every other filter, the URL is the state.
  const { bug, design } = await setup(page);
  await page.goto(`/projects/WEB?label=${bug}&label=${design}`);
  await expect.poll(() => visibleTitles(page)).toEqual(["Bug and design", "Four labels"]);
  await page.reload();
  await expect.poll(() => visibleTitles(page)).toEqual(["Bug and design", "Four labels"]);
  await expect(combobox(page, "Filter by label")).toHaveAttribute("data-value", `${bug},${design}`);

  await page.goto("/projects/WEB?label=not-an-id");
  await expect.poll(() => visibleTitles(page)).toHaveLength(4);
});

test("a filter that matches nothing says so", async ({ loggedInPage: page }) => {
  // Why: tech-debt and docs only both exist on one issue; add a label nobody has to get an empty result.
  const { debt, bug } = await setup(page);
  await page.goto(`/projects/WEB?label=${debt}&label=${bug}&status=done`);
  await expect(page.getByText("No issues match these filters.")).toBeVisible();
});

test("the issue page shows the labels, and adding one in the editor updates the card without a reload", async ({ loggedInPage: page }) => {
  // Why: the editor's picker, the issue page and the list cards must agree.
  const { issueIds } = await setup(page);
  await page.goto("/projects/WEB/issues/WEB-2");
  await expect(page.getByRole("group", { name: "Labels" }).getByText("bug", { exact: true })).toBeVisible();
  void issueIds;

  await page.goto("/projects/WEB");
  await expect(card(page, "Only bug").getByRole("button", { name: /Filter by label/ })).toHaveCount(1);
  await card(page, "Only bug").getByRole("button", { name: "Edit" }).click();
  await combobox(editor(page), "Add label").click();
  await page.getByRole("option", { name: "docs", exact: true }).click();
  await page.keyboard.press("Escape");
  await editor(page).getByRole("button", { name: "Cancel" }).click();
  await expect(card(page, "Only bug").getByRole("button", { name: /Filter by label/ })).toHaveCount(2); // bug and docs
});

test("removing a label in the editor keeps the editor open and saves nothing else", async ({ loggedInPage: page }) => {
  // Why: the pill's X was a bare button inside the editor's form, so it SUBMITTED the form: the editor saved and closed.
  await setup(page);
  await page.goto("/projects/WEB");
  await card(page, "Bug and design").getByRole("button", { name: "Edit" }).click();
  const dialog = editor(page);
  await expect(dialog.getByRole("button", { name: "Remove bug" })).toBeVisible();
  await dialog.getByLabel("Title").fill("Half typed title");

  await dialog.getByRole("button", { name: "Remove bug" }).click();
  await expect(dialog.getByRole("button", { name: "Remove bug" })).toHaveCount(0); // the label is gone from the issue...
  await expect(dialog).toBeVisible(); // ...and the editor is still open
  await expect(dialog.getByLabel("Title")).toHaveValue("Half typed title"); // with what I was typing

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(card(page, "Bug and design")).toBeVisible(); // the title was never saved
  await expect(card(page, "Half typed title")).toHaveCount(0);
  await expect(card(page, "Bug and design").getByRole("button", { name: /Filter by label/ })).toHaveCount(1); // only design is left
});
