import { test, expect } from "../support/fixtures";

test("create a project and an issue, then post, edit and delete a comment", async ({
  loggedInPage: page,
}) => {
  // Why: the core flow a team uses all day, end to end through the real UI,
  // including the comment edit/delete behaviour added in Phase 8.5 slice 1.
  await page.getByLabel("Name", { exact: true }).fill("Website");
  await page.getByLabel("Key").fill("WEB");
  await page.getByRole("button", { name: "Add project" }).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: /Website/ })
    .click();

  await page.getByRole("button", { name: /New issue/ }).click();
  await page.getByRole("dialog", { name: "New issue" }).getByLabel("Title").fill("Fix the footer");
  await page.getByRole("dialog", { name: "New issue" }).getByRole("button", { name: "Add issue" }).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: /Fix the footer/ })
    .click();
  await expect(page.getByRole("heading", { name: "Fix the footer" })).toBeVisible();

  // Post
  await page.getByPlaceholder("Add a comment…").fill("First version");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const comment = page.locator("li", { hasText: "First version" });
  await expect(comment).toBeVisible();

  // Edit
  await comment.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit comment").fill("Second version");
  await page.getByRole("button", { name: "Save" }).click();
  const edited = page.locator("li", { hasText: "Second version" });
  await expect(edited).toBeVisible();
  await expect(edited).toContainText("(edited)");
  await expect(page.getByText("First version")).toHaveCount(0);

  // Delete (two steps: Delete, then Yes)
  await edited.getByRole("button", { name: "Delete" }).click();
  await edited.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("Comment deleted")).toBeVisible();
  await expect(page.getByText("Second version")).toHaveCount(0);
});
