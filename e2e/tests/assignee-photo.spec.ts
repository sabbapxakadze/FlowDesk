import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { makePng } from "../support/png";

/**
 * The small circle on an issue card shows the assignee's photo, and like every other picture of a person it opens
 * the person card on hover and goes to their profile on click. It sits beside the card's issue link, not inside it.
 */

async function assignToSelfWithPhoto(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Mine", "Nobody's"],
  });
  await page.goto("/profile");
  await page.getByLabel("Photo file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: makePng(64, 64) });
  await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();

  const { headers, base } = await apiSession(page.request);
  const members = await (await page.request.get(`${base}/members`, { headers })).json();
  const me = members.data[0].userId as string;
  const res = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, {
    headers,
    data: { version: 1, assigneeId: me },
  });
  expect(res.status()).toBe(200);
  return { me };
}

test("the card's circle shows the photo, opens the person card, and a click goes to the profile; the title still opens the panel", async ({
  loggedInPage: page,
}) => {
  // Why: until now the circle was initials only and not a link (the card is a link, and a link cannot hold a link).
  const { me } = await assignToSelfWithPhoto(page);
  await page.goto("/projects/WEB");
  const card = page.getByRole("listitem").filter({ hasText: "Mine" });
  const circle = card.getByRole("link", { name: "Assigned to E2E User" });
  await expect(circle).toHaveAttribute("href", `/people/e2e-user-${me.slice(0, 8)}`);
  const photo = circle.locator("img");
  await expect(photo).toHaveAttribute("src", /^\/api\/v1\/avatars\/[a-f0-9]{32}$/);
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

  // Not nested in the issue link, and the unassigned card has none.
  expect(await circle.evaluate((el) => el.closest("a[href*='/issues/']") === null)).toBe(true);
  await expect(page.getByRole("listitem").filter({ hasText: "Nobody's" }).getByRole("link", { name: /Assigned to/ })).toHaveCount(0);

  // Hover: the person card.
  await circle.hover();
  await expect(card.getByRole("tooltip").getByText("E2E User")).toBeVisible();
  // The circle is at the right end of the row; the whole person card still has to be inside the window.
  const shown = (await card.getByRole("tooltip").locator("> span").boundingBox())!;
  expect(shown.x).toBeGreaterThanOrEqual(0);
  expect(shown.x + shown.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  // The title still opens the issue in the panel; the circle goes to the profile.
  await card.getByRole("link", { name: /Mine/ }).first().click();
  await expect(page).toHaveURL(/issue=WEB-1/);
  const panel = page.locator('section[aria-label="Issue"]');
  await expect(panel).toBeFocused(); // focus moves in together with the panel's key listener
  await page.keyboard.press("Escape"); // the panel floats over the right edge, where the circle is
  await expect(panel).toHaveCount(0);
  await circle.click();
  await expect(page).toHaveURL(new RegExp(`/people/e2e-user-${me.slice(0, 8)}$`));
});

test("on the board the circle is a profile link too, and grabbing a card by its circle still drags it", async ({
  loggedInPage: page,
}) => {
  // Why: board cards are draggable from anywhere. A profile link on the card must neither start the browser's own
  // link drag nor open the profile when a drag ends on it.
  const { me } = await assignToSelfWithPhoto(page);
  await page.goto("/projects/WEB/board");
  const column = (name: string) => page.getByRole("group", { name, exact: true });
  const card = column("Todo").getByRole("listitem").filter({ hasText: "Mine" });
  const circle = card.getByRole("link", { name: "Assigned to E2E User" });
  await expect(circle.locator("img")).toHaveAttribute("src", /\/api\/v1\/avatars\//);

  const from = (await circle.boundingBox())!;
  const to = (await column("In progress").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 20 });
  await page.mouse.up();
  await expect(column("In progress")).toContainText("Mine");
  await expect(page).toHaveURL(/\/board$/); // the drop did not open the profile

  // A plain click on the circle goes to the profile.
  await column("In progress").getByRole("link", { name: "Assigned to E2E User" }).click();
  await expect(page).toHaveURL(new RegExp(`/people/e2e-user-${me.slice(0, 8)}$`));
});

test("a drag that starts and ends on the circle does not open the profile", async ({ loggedInPage: page }) => {
  // Why: after a real drag the browser still fires a click where the pointer is released, and a profile link under it
  // would open in the middle of a drop. (The drag overlay is under the pointer, so the click does not land on the link:
  // the card needs no extra click guard for it; this test is what keeps that true.)
  await assignToSelfWithPhoto(page);
  await page.goto("/projects/WEB/board");
  const circle = page
    .getByRole("group", { name: "Todo", exact: true })
    .getByRole("listitem")
    .filter({ hasText: "Mine" })
    .getByRole("link", { name: "Assigned to E2E User" });
  const at = (await circle.boundingBox())!;
  const x = at.x + at.width / 2;
  const y = at.y + at.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 30, { steps: 6 }); // a real drag: past the sensor's activation distance
  await page.mouse.move(x, y, { steps: 6 }); // and back onto the circle
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/projects\/WEB\/board$/);
});
