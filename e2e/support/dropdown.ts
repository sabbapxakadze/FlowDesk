import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Helpers for the app's own dropdown (shared/ui/Dropdown): a `combobox` button that opens a `listbox` of `option`s.
 * Playwright's selectOption only works on a native <select>, so a test opens the box and clicks the option, as a
 * person does.
 */

/** The dropdown's box, found by its accessible name (the aria-label, or the label it sits in). */
export const combobox = (scope: Page | Locator, name: string | RegExp) => scope.getByRole("combobox", { name });

/** Open the dropdown and choose an option by its label. */
export async function pick(box: Locator, option: string | RegExp) {
  await box.click();
  await box.page().getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

/** The value the dropdown currently holds (its `data-value`), not its label. */
export const expectValue = (box: Locator, value: string) => expect(box).toHaveAttribute("data-value", value);

/** The issue editor popup, and one of its dropdowns (Status, Priority, Assignee). */
export const editor = (page: Page) => page.getByRole("dialog", { name: /^Edit / });
export const editField = (page: Page, name: string) => editor(page).getByRole("combobox", { name: new RegExp(name, "i") });

/** The Role dropdown of the invitation form (the only dropdown inside the form that has the Email field). */
export const inviteRole = (page: Page) =>
  page.locator("form").filter({ has: page.getByLabel("Email") }).getByRole("combobox");
