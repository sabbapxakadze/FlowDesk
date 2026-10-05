import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

/**
 * @mentions in comments (ADR 0033): type @ under the comment box, pick a person, the posted comment shows them as a link,
 * editing keeps them, and the person mentioned is told ("mentioned you in a comment").
 */

async function setup(page: import("@playwright/test").Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Talk about me"],
  });
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  await addOrgMember("e2e-user@example.com", { email: "e2e-third@example.com", name: "Third Person" });
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  return { projectId, issueId: issueIds[0]! };
}

test("typing @ lists matching people under the box; Esc closes only the list; keyboard choice inserts @Name", async ({ loggedInPage: page }) => {
  // Why: the picker is the feature's front door. It must filter as you type, work from the keyboard, and Esc must
  // not throw the text (or a panel behind it) away.
  await setup(page);
  const box = page.getByPlaceholder("Add a comment…");
  await box.click();
  await box.pressSequentially("Hi @sec");
  const list = page.getByRole("listbox", { name: "Mention a person" });
  await expect(list.getByRole("option")).toHaveCount(1); // only "Second Person" matches "sec"
  await expect(list.getByRole("option", { name: "Second Person" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(box).toHaveValue("Hi @sec"); // the text stays
  await expect(page).toHaveURL(/issues\/WEB-1/); // and we are still on the issue

  await box.fill(""); // a fresh `@` opens the list again (Esc only closed it for the old one)
  await box.pressSequentially("Hi @");
  await expect(list.getByRole("option")).toHaveCount(3); // everyone in the organization, the writer included
  await page.keyboard.press("ArrowDown"); // the list is by name: E2E User, Second Person, Third Person
  await page.keyboard.press("Enter");
  await expect(list).toHaveCount(0);
  await expect(box).toHaveValue("Hi @Second Person ");
});

test("after Esc the list stays closed while you keep typing, and opens again when the text after the @ is replaced", async ({ loggedInPage: page }) => {
  // Why: Esc used to close the list for that @ position for good, so replacing or pasting text there never reopened it.
  await setup(page);
  const box = page.getByPlaceholder("Add a comment…");
  const list = page.getByRole("listbox", { name: "Mention a person" });
  await box.click();
  await box.pressSequentially("Hi @s");
  await expect(list).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await box.pressSequentially("e"); // still the same mention, only longer: stays closed
  await expect(list).toHaveCount(0);

  await box.fill("Hi @"); // the text replaced in one go (a paste): a different query, so it opens again
  await expect(list.getByRole("option")).toHaveCount(3);
});

test("a posted mention is a link to the person; editing the comment keeps it", async ({ loggedInPage: page }) => {
  // Why: the stored body holds a token, the box shows @Name. Posting encodes, editing decodes, and both must round-trip,
  // otherwise an edit would silently turn the mention into text (or show the raw token).
  await setup(page);
  const box = page.getByPlaceholder("Add a comment…");
  await box.click();
  await box.pressSequentially("Please look @Second");
  await page.getByRole("option", { name: "Second Person" }).click(); // by mouse this time
  await box.pressSequentially("at this");
  await page.getByRole("button", { name: "Comment", exact: true }).click();

  const card = page.getByRole("listitem").filter({ hasText: "Please look" });
  await expect(card.getByRole("link", { name: "Second Person" })).toBeVisible();
  await expect(card.locator("p", { hasText: "Please look" })).toContainText("at this");
  await expect(card).not.toContainText("user:"); // never the raw token

  await card.getByRole("button", { name: "Edit this comment" }).click();
  const edit = page.getByLabel("Edit comment");
  await expect(edit).toHaveValue("Please look @Second Person at this"); // decoded back to readable text
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled(); // nothing changed yet
  await edit.press("Control+End"); // the box opens with the caret at the start, as an edit box always did
  await edit.pressSequentially(" now");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("link", { name: "Second Person" })).toBeVisible(); // still a mention
  await expect(card.locator("p", { hasText: "Please look" })).toContainText("at this now");
});

test("the person mentioned is told, in words that say so", async ({ loggedInPage: owner, browser }) => {
  // Why: a mention that nobody hears about is useless. This person never touched the issue, so before mentions they
  // would have heard nothing.
  await setup(owner);
  const ctx = await browser.newContext();
  const second = await ctx.newPage();
  await logInThroughForm(second, "e2e-second@example.com");

  const box = owner.getByPlaceholder("Add a comment…");
  await box.click();
  await box.pressSequentially("Over to you @Second");
  await owner.getByRole("option", { name: "Second Person" }).click();
  await owner.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(owner.getByRole("listitem").filter({ hasText: "Over to you" }).getByRole("link", { name: "Second Person" })).toBeVisible();

  const bell = second.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toContainText("1"); // arrives live, no reload
  await bell.click();
  await expect(second.getByText("mentioned you in a comment").first()).toBeVisible();
  await ctx.close();
});
