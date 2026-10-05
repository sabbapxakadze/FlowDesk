import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";
import { combobox, editField, editor, expectValue, pick } from "../support/dropdown";

/**
 * The app's own dropdown (shared/ui/Dropdown) replaced every native <select>: filters, sort, the issue editor, roles,
 * labels, the audit log and the analytics ranges.
 */

const listbox = (page: Page) => page.getByRole("listbox");

async function setup(page: Page, titles = ["Alpha", "Beta"]) {
  return createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles });
}

test("it opens with the mouse or keys, moves with the arrows, chooses with Enter, and says what it holds", async ({
  loggedInPage: page,
}) => {
  // Why: the basics, and the accessible shape (combobox, listbox, option, aria-selected) a screen reader relies on.
  await setup(page);
  await page.goto("/projects/WEB");
  const status = combobox(page, "Filter by status");
  await expect(status).toHaveAttribute("aria-expanded", "false");
  await expectValue(status, "");

  await status.focus();
  await page.keyboard.press("ArrowDown"); // opens
  await expect(status).toHaveAttribute("aria-expanded", "true");
  await expect(listbox(page)).toBeVisible();
  await expect(page.getByRole("option", { name: "All statuses" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown"); // Todo
  await page.keyboard.press("ArrowDown"); // In progress
  await page.keyboard.press("Enter");
  await expect(listbox(page)).toHaveCount(0);
  await expect(page).toHaveURL(/status=in_progress/);
  await expectValue(status, "in_progress");
  await expect(status).toBeFocused(); // focus stays on the box

  // Type-ahead: "d" jumps to Done.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("d");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/status=done/);
});

test("Esc closes only the list: the side panel and a dialog behind it stay open", async ({ loggedInPage: page }) => {
  // Why: Esc used to close the panel or dialog; with a list open it must close just the list first.
  await setup(page);
  await page.goto("/projects/WEB?issue=WEB-1");
  const panel = page.locator('section[aria-label="Issue"]');
  await expect(panel).toBeVisible();

  const sort = combobox(page, "Sort");
  await sort.click();
  await expect(listbox(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(listbox(page)).toHaveCount(0);
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor(page)).toBeVisible();
  await editField(page, "Priority").click();
  await expect(listbox(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(listbox(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible(); // the popup is still there
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0); // and the next Esc closes it
});

test("inside the issue editor it is not clipped, the label does not reopen it, and it flips upward near the bottom", async ({
  loggedInPage: page,
}) => {
  // Why: the editor is a dialog (overflow, top layer) inside <label>s; a list that is clipped, or that a label click
  // reopens, would be broken there. A short window forces the list to open upward.
  await setup(page);
  await page.setViewportSize({ width: 1100, height: 560 });
  await page.goto("/projects/WEB");
  await page.getByRole("listitem").filter({ hasText: "Alpha" }).getByRole("button", { name: "Edit" }).click();

  const status = editField(page, "Status");
  await status.click();
  await expect(listbox(page)).toBeVisible();
  const box = (await page.locator("div.motion-drop-in").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(560);
  await page.getByRole("option", { name: "Done", exact: true }).click();
  await expect(listbox(page)).toHaveCount(0); // chosen, and the <label> around the box did not open it again
  await expectValue(status, "done");

  const priority = editField(page, "Priority");
  const trigger = (await priority.boundingBox())!;
  await priority.click();
  const list = (await page.locator("div.motion-drop-in").boundingBox())!;
  expect(list.y + list.height).toBeLessThanOrEqual(560);
  expect(list.y + list.height).toBeLessThanOrEqual(trigger.y + 1); // opened upward: there was more room above
  await page.keyboard.press("Escape");
});

test("a long list gets a search box that filters it, and says when nothing matches", async ({ loggedInPage: page }) => {
  // Why: people lists can be long (the assignee dropdown), so past seven options a search box appears.
  await setup(page);
  for (let i = 1; i <= 8; i++) {
    await addOrgMember("e2e-user@example.com", { email: `member${i}@example.com`, name: `Person Number${i}` });
  }
  await page.goto("/projects/WEB");
  const assignee = combobox(page, "Filter by assignee");
  await assignee.click();
  const search = page.getByRole("searchbox", { name: "Search options" });
  await expect(search).toBeFocused();
  await search.fill("Number3");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.fill("zzz");
  await expect(page.getByText("No matches")).toBeVisible();
  await search.fill("Number5");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/assignee=/);
  await expect(assignee).toContainText("Person Number5");

  // A short list (status) has none.
  await combobox(page, "Filter by status").click();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
});

test("choosing a longer option does not change the box's width (a row of filters never jumps)", async ({
  loggedInPage: page,
}) => {
  // Why: a custom box sized to its current label would resize on every choice; it is as wide as the widest option.
  await setup(page);
  await page.goto("/projects/WEB");
  const sort = combobox(page, "Sort");
  const before = (await sort.boundingBox())!.width;
  await pick(sort, "Highest priority first");
  await expect(page).toHaveURL(/sort=priority/);
  expect((await sort.boundingBox())!.width).toBeCloseTo(before, 0); // the longest label is chosen: same width
  await pick(sort, "Oldest first");
  await expect(page).toHaveURL(/order=asc/);
  expect((await sort.boundingBox())!.width).toBeCloseTo(before, 0);
});

test("a click elsewhere closes it", async ({ loggedInPage: page }) => {
  // Why: the list is fixed to the screen, so it must not be left behind.
  await setup(page);
  await page.goto("/projects/WEB");
  await combobox(page, "Sort").click();
  await expect(listbox(page)).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Issues" }).click();
  await expect(listbox(page)).toHaveCount(0);
});
