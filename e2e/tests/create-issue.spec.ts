import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * "New issue" (ADR 0035): the same button and popup on the Issues list and on the Board. The inline form is gone.
 */

const dialog = (page: Page) => page.getByRole("dialog", { name: "New issue" });
const button = (page: Page) => page.getByRole("button", { name: /New issue/ });

test("on the list the button opens the popup with Title focused, and Add issue closes it with the new issue in the list", async ({
  loggedInPage: page,
}) => {
  // Why: this replaces the inline form, so it has to do everything the form did.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Existing"] });
  await page.goto("/projects/WEB");
  await button(page).click();
  await expect(dialog(page).getByLabel("Title")).toBeFocused();
  await dialog(page).getByLabel("Title").fill("Brand new");
  await dialog(page).getByLabel("Description").fill("With words");
  await dialog(page).getByRole("button", { name: "Add issue" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Brand new/ }).first()).toBeVisible();
});

test("on the board the same button creates an issue and its card appears in Todo without a reload", async ({ loggedInPage: page }) => {
  // Why: the Board had no way to create at all. Its data is a different query from the list's, so the refresh must reach it.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Existing"] });
  await page.goto("/projects/WEB/board");
  const todo = page.getByRole("group", { name: "Todo", exact: true });
  await expect(todo.getByRole("listitem").filter({ hasText: "Existing" })).toBeVisible();
  await button(page).click();
  await dialog(page).getByLabel("Title").fill("From the board");
  await dialog(page).getByRole("button", { name: "Add issue" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(todo.getByRole("listitem").filter({ hasText: "From the board" })).toBeVisible();
});

test("an empty title says so and creates nothing; a click outside keeps typed text; Esc and Cancel close it", async ({ loggedInPage: page }) => {
  // Why: the popup must not lose work to a stray click, and must not create an issue without a title.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Existing"] });
  await page.goto("/projects/WEB");
  const rows = page.locator('ul > li a[href*="/issues/"]');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();

  await button(page).click();
  await dialog(page).getByRole("button", { name: "Add issue" }).click();
  await expect(dialog(page).getByText("Title is required")).toBeVisible();
  await expect(dialog(page)).toHaveCount(1);

  await dialog(page).getByLabel("Title").fill("Half typed");
  await page.mouse.click(5, 5); // the dimmed area
  await expect(dialog(page)).toHaveCount(1);
  await expect(dialog(page).getByLabel("Title")).toHaveValue("Half typed");

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await button(page).click();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(rows).toHaveCount(before);
});
