import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";
import { editField, pick } from "../support/dropdown";

const visibleCard = (page: Page) => page.locator('[role="tooltip"]:visible');

/** An issue assigned to Second Person, with one comment, opened on its page. */
async function openIssue(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Pass the baton"],
  });
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });
  await page.goto(`/projects/${projectId}`);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Pass the baton" })
    .getByRole("button", { name: "Edit" })
    .click();
  await pick(editField(page, "Assignee"), "Second Person");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("img", { name: "Assigned to Second Person" })).toBeVisible();
  const url = `/projects/${projectId}/issues/${issueIds[0]}`;
  await page.goto(url);
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("A comment to hover");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByText("A comment to hover")).toBeVisible();
  return { url };
}

test("the card opens after a short pause, not instantly, and stays open while the cursor moves onto it", async ({
  loggedInPage: page,
}) => {
  // Why: the owner found the card appeared "0.000000001 second" after the cursor
  // touched a name. It now waits 300 ms (hover intent), so just passing over a name
  // shows nothing, and it must not vanish when the cursor travels onto the card.
  await openIssue(page);
  const header = page.locator("li", { hasText: "A comment to hover" });
  const name = header.getByRole("link", { name: "E2E User" });

  await name.hover();
  await page.waitForTimeout(120);
  await expect(visibleCard(page)).toHaveCount(0); // too early: still waiting
  await expect(visibleCard(page)).toHaveCount(1); // then it opens (auto-waits)

  // A cursor that only crosses the name and leaves within the delay opens nothing.
  await page.mouse.move(5, 5);
  await expect(visibleCard(page)).toHaveCount(0);
  await name.hover();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(600);
  await expect(visibleCard(page)).toHaveCount(0);

  // Onto the card: it stays.
  await name.hover();
  await expect(visibleCard(page)).toHaveCount(1);
  const card = (await visibleCard(page).boundingBox())!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2, { steps: 5 });
  await page.waitForTimeout(500);
  await expect(visibleCard(page)).toHaveCount(1);
  await expect(visibleCard(page)).toContainText("e2e-user@example.com");
});

test("a person's name opens the same card in a comment header, the assignee line, and the attachment list", async ({
  loggedInPage: page,
}) => {
  // Why: the owner wanted every place that shows a person to behave the same.
  await openIssue(page);

  // Comment header: the author.
  const comment = page.locator("li", { hasText: "A comment to hover" });
  await comment.getByRole("link", { name: "E2E User" }).hover();
  await expect(visibleCard(page)).toContainText("Owner");
  await expect(visibleCard(page)).toContainText("e2e-user@example.com");
  await page.mouse.move(5, 5);
  await expect(visibleCard(page)).toHaveCount(0);

  // The issue header's assignee (avatar and name in one button).
  const assignee = page.getByRole("link", { name: /^SP\s*Second Person$|Second Person/ }).first();
  await assignee.hover();
  await expect(visibleCard(page)).toContainText("Member");
  await expect(visibleCard(page)).toContainText("e2e-second@example.com");
  await page.mouse.move(5, 5);
  await expect(visibleCard(page)).toHaveCount(0);

  // The attachment list: the uploader (a direct upload by E2E User).
  await page.evaluate(() => {
    const input = document.querySelector(
      'input[type="file"]:not([aria-label="Attach files to comment"])',
    ) as HTMLInputElement | null;
    if (!input) throw new Error("no direct upload input");
    const dt = new DataTransfer();
    dt.items.add(new File(["hello"], "direct.txt", { type: "text/plain" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // The attachment row is the one with a Remove button (the timeline line has none).
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "direct.txt" })
    .filter({ has: page.getByRole("button", { name: "Remove" }) });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "E2E User" }).hover();
  await expect(visibleCard(page)).toContainText("e2e-user@example.com");
});

test("who else is viewing the issue is shown as hoverable names", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: the live "is also viewing" line is a place that names a person too.
  const { url } = await openIssue(page);
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  await pageB.goto(url);
  await expect(pageB.getByRole("heading", { name: "Pass the baton" })).toBeVisible();

  const line = page.getByText(/is also viewing/);
  await expect(line).toBeVisible();
  await page.getByRole("link", { name: "Second Person" }).last().hover();
  await expect(visibleCard(page)).toContainText("e2e-second@example.com");
  await contextB.close();
});

test("hovering anywhere else on a comment opens nothing; only the name and the picture open the card", async ({
  loggedInPage: page,
}) => {
  // Why: the comment card is a Tailwind `group` (for the Edit/Delete reveal), and the
  // person card used a plain `group-hover`, so the card opened with the cursor anywhere
  // on the comment. The card now has its own named group.
  await openIssue(page);
  const comment = page.locator("li", { hasText: "A comment to hover" });

  // The empty right end of the header, the body text, and the time: nothing opens.
  const box = (await comment.boundingBox())!;
  const spots = [
    { x: box.x + box.width / 2, y: box.y + 20 }, // header, middle (blank)
    { x: box.x + box.width - 60, y: box.y + 20 }, // header, far right
    { x: box.x + 30, y: box.y + box.height - 15 }, // body
  ];
  for (const spot of spots) {
    await page.mouse.move(spot.x, spot.y);
    await page.waitForTimeout(600); // longer than the 300 ms open delay
    await expect(visibleCard(page)).toHaveCount(0);
  }
  await comment.getByText("A comment to hover").hover();
  await page.waitForTimeout(600);
  await expect(visibleCard(page)).toHaveCount(0);
  await comment.locator("time").hover();
  await page.waitForTimeout(600);
  await expect(visibleCard(page)).toHaveCount(0);

  // The picture opens it, and so does the name.
  await comment.getByRole("img", { name: "E2E User" }).first().hover();
  await expect(visibleCard(page)).toContainText("e2e-user@example.com");
  await page.mouse.move(5, 5);
  await expect(visibleCard(page)).toHaveCount(0);
  await comment.getByRole("link", { name: "E2E User" }).hover();
  await expect(visibleCard(page)).toContainText("e2e-user@example.com");
});

test("a hover card near the bottom of the window opens above the name, so all of it stays on screen", async ({ loggedInPage: page }) => {
  // Why: the card is fixed to the window, so it adds no page height and cannot be scrolled to. Opening below a name near the bottom edge put its
  // "View profile" link out of reach (found when the comment box got taller).
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Near the bottom"] });
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(page.getByRole("heading", { name: "Near the bottom" })).toBeVisible();

  const name = page.locator("li", { hasText: "created this issue" }).getByRole("link", { name: "E2E User" }).first(); // the creator, in the activity list
  await name.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await name.hover();
  const card = page.locator('[role="tooltip"]:visible');
  await expect(card).toContainText("View profile");
  const box = (await card.boundingBox())!;
  const link = (await name.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(560);
  expect(box.y + box.height).toBeLessThanOrEqual(link.y + 8); // it is above the name, not below it
});
