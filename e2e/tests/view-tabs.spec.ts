import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * The List / Board tabs (ADR 0034): Issues and Board show the same issues, so each page's header carries a switch to the other, and the
 * sidebar has one link (Issues) for both.
 */

test("each page has the List and Board tabs, marks the current one, and switches to the other; the sidebar has no Board link", async ({
  loggedInPage: page,
}) => {
  // Why: the board is now reached only through this control. A tab that marked the wrong page, or went to the wrong address, would hide it.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Anything"] });
  const nav = page.getByRole("navigation", { name: "Main" });
  const views = page.getByRole("navigation", { name: "View" });

  await page.goto("/projects/WEB");
  await expect(views.getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "page");
  await expect(views.getByRole("link", { name: "Board" })).not.toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Board" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Issues" })).toHaveAttribute("aria-current", "page");

  await views.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/board$/);
  await expect(page.getByRole("heading", { level: 1, name: "Board" })).toBeVisible();
  await expect(views.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
  await expect(views.getByRole("link", { name: "List" })).not.toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Issues" })).toHaveAttribute("aria-current", "page"); // still the Issues area

  await views.getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/\/projects\/WEB$/);
  await expect(page.getByRole("heading", { level: 1, name: "Issues" })).toBeVisible();
});
