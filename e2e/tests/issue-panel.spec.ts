import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";
import { makePng } from "../support/png";
import { combobox, pick } from "../support/dropdown";

const panelOf = (page: Page) => page.getByRole("dialog", { name: "Issue", exact: true });
const cardLink = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(title) });

async function setup(page: Page, titles = ["Alpha issue", "Beta issue"]) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles,
  });
  return { projectId, issueIds, listUrl: `/projects/${projectId}` };
}

test("clicking an issue opens it in a panel with the key, a full-page link and a close button; Esc closes it and focus returns", async ({
  loggedInPage: page,
}) => {
  // Why: the heart of the feature. The panel must show the real issue, put it in the URL
  // (?issue=), offer the full page, and close cleanly with focus back on the card.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  const link = cardLink(page, "Alpha issue");
  await link.click();

  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("WEB-1");
  await expect(panel.getByRole("heading", { level: 2, name: "Alpha issue" })).toBeVisible();
  await expect(page).toHaveURL(/\?issue=WEB-1$/);
  await expect(page.getByRole("link", { name: /Alpha issue/ }).first()).toBeVisible(); // the list is still there
  await expect(panel.getByRole("link", { name: /Open full page/ })).toHaveAttribute(
    "href",
    "/projects/WEB/issues/WEB-1",
  );
  await expect(panel.getByRole("button", { name: "Close panel" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/projects\/WEB$/);
  await expect(link).toBeFocused();
});

test("clicking another issue swaps the panel; Back closes it instead of walking through every issue", async ({
  loggedInPage: page,
}) => {
  // Why: the owner asked that another card swaps the panel. History: the first open adds
  // an entry, a swap replaces it, so one Back returns to the list.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Alpha issue" })).toBeVisible();

  await cardLink(page, "Beta issue").click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Beta issue" })).toBeVisible();
  await expect(page).toHaveURL(/\?issue=WEB-2$/);
  await expect(panelOf(page)).toHaveCount(1);

  await page.goBack();
  await expect(panelOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/projects/[^/?]+$`));
});

test("pressing the empty page closes the panel; pressing inside it, or typing in it, does not", async ({
  loggedInPage: page,
}) => {
  // Why: the owner's rule: another card swaps it, anywhere else closes it. Inside the panel
  // must never close it, and a comment can be posted from the panel.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel).toBeVisible();

  await panel.getByRole("heading", { level: 2, name: "Alpha issue" }).click();
  await page.waitForTimeout(150);
  await expect(panel).toBeVisible();

  await panel.getByPlaceholder("Add a comment…").fill("Written inside the panel");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(panel.getByText("Written inside the panel")).toBeVisible();
  await expect(panel).toBeVisible();

  // The empty left of the page (the area beside the list): outside.
  await page.mouse.click(260, 560);
  await expect(panel).toHaveCount(0);
});

test("a click outside that lands on a link still works while the panel closes; changing the sort with the panel open keeps it open and in the URL", async ({
  loggedInPage: page,
}) => {
  // Why: (1) the outside click must not be swallowed: a sidebar link must still navigate.
  // (2) The panel's ?issue= and the list's own parameters must not wipe each other.
  const { listUrl } = await setup(page);
  await page.goto(`${listUrl}?status=todo`);
  await cardLink(page, "Alpha issue").click();
  await expect(panelOf(page)).toBeVisible();

  // A REAL click on a filter first (selectOption fires no click, which is how this once passed
  // while a real mouse closed the panel), including Sort, which used to sit under the panel at
  // this window width (the filter row now wraps clear of it).
  const panelBox = (await panelOf(page).boundingBox())!;
  for (const label of ["Filter by status", "Filter by priority", "Filter by assignee", "Sort"]) {
    const box = (await page.getByLabel(label).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x);
    await page.getByLabel(label).click();
    await page.keyboard.press("Escape"); // close the native option list, if one opened
    await expect(panelOf(page)).toBeVisible();
  }
  await pick(combobox(page, "Sort"), "Highest priority first");
  await expect(page).toHaveURL(/sort=priority/);
  await expect(page).toHaveURL(/status=todo/);
  await expect(page).toHaveURL(/issue=WEB-1/); // still open
  await expect(panelOf(page)).toBeVisible();

  // A real click on a sidebar link, outside the panel.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/board$/); // the link worked
  await expect(panelOf(page)).toHaveCount(0); // and the panel is gone
});

test("a reload keeps the panel open, and the full-page link and a Ctrl+click still go to the issue page", async ({
  loggedInPage: page,
  context,
}) => {
  // Why: the URL is the source of truth, and a modified click must keep its normal meaning.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  await expect(panelOf(page)).toBeVisible();
  await page.reload();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Alpha issue" })).toBeVisible();

  await panelOf(page).getByRole("link", { name: /Open full page/ }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Alpha issue" })).toBeVisible();
  await expect(panelOf(page)).toHaveCount(0);

  await page.goto(listUrl);
  const newTab = context.waitForEvent("page");
  await cardLink(page, "Beta issue").click({ modifiers: ["Control"] });
  const tab = await newTab;
  expect(tab.url()).toContain("/issues/WEB-2");
  await expect(panelOf(page)).toHaveCount(0);
});

test("an id that does not exist shows 'Issue not found' inside the panel, which can still be closed", async ({
  loggedInPage: page,
}) => {
  const { listUrl } = await setup(page);
  await page.goto(`${listUrl}?issue=00000000-0000-4000-8000-000000000000`);
  const panel = panelOf(page);
  await expect(panel.getByText("Issue not found.")).toBeVisible();
  await panel.getByRole("button", { name: "Close panel" }).click();
  await expect(panel).toHaveCount(0);
});

test("on the board a click opens the panel, but finishing a drag does not", async ({
  loggedInPage: page,
}) => {
  // Why: the board cards are draggable from anywhere and are links; the drag-click guard
  // must keep a drop from opening the panel (the bug ADR 0018 fixed for navigation).
  const { projectId } = await setup(page, ["Drag me", "Other"]);
  await page.goto(`/projects/${projectId}/board`);
  const column = (name: string) => page.getByRole("group", { name, exact: true });
  const card = column("Todo").getByRole("listitem").filter({ hasText: "Drag me" });
  const from = (await card.boundingBox())!;
  const to = (await column("In progress").boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 20 });
  await page.mouse.up();
  await expect(column("In progress")).toContainText("Drag me");
  await page.waitForTimeout(400);
  await expect(panelOf(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/issue=/);

  await cardLink(page, "Drag me").click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Drag me" })).toBeVisible();
  await expect(page).toHaveURL(/\/board\?issue=/);
});

test("on the sprints page a backlog issue opens in the panel", async ({ loggedInPage: page }) => {
  const { projectId } = await setup(page, ["Backlog item"]);
  await page.goto(`/projects/${projectId}/sprints`);
  await cardLink(page, "Backlog item").click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Backlog item" })).toBeVisible();
  await expect(page).toHaveURL(/\/sprints\?issue=/);
});

test("deleting the issue from the panel closes it and says so; the card is gone", async ({
  loggedInPage: page,
}) => {
  const { listUrl } = await setup(page, ["Doomed", "Survivor"]);
  await page.goto(listUrl);
  await cardLink(page, "Doomed").click();
  const panel = panelOf(page);
  await panel.getByRole("button", { name: "Delete issue" }).click();
  await panel.getByRole("alertdialog").getByRole("button", { name: "Delete issue" }).click();

  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("This issue was deleted.");
  await expect(page.getByRole("link", { name: /Doomed/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Survivor/ })).toBeVisible();
});

test("a comment from another person shows up live in the open panel", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: the panel reuses the issue's live updates; a second real user proves it.
  const { listUrl, issueIds, projectId } = await setup(page);
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  await expect(panelOf(page)).toBeVisible();

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await logInThroughForm(other, "e2e-second@example.com");
  await other.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await other.getByPlaceholder("Add a comment…").fill("Hello from Second");
  await other.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(other.getByText("Hello from Second")).toBeVisible();

  await expect(panelOf(page).getByText("Hello from Second")).toBeVisible();
  await expect(panelOf(page).getByText("Second Person is also viewing")).toHaveCount(0); // they left no presence here
  await ctx.close();
});

test("Esc inside an image preview closes only the preview, not the panel; pressing the preview does not close the panel", async ({
  loggedInPage: page,
}) => {
  // Why: the panel listens for Esc and outside presses; a native dialog opened from inside
  // it must get its own Esc and its own clicks first.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel.getByPlaceholder("Add a comment…")).toBeVisible(); // content loaded
  await panel.evaluate((_, base64) => {
    const input = document.querySelector('input[aria-label="Attach files to comment"]') as HTMLInputElement;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "shot.png", { type: "image/png" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, makePng(400, 300).toString("base64"));
  await panel.getByPlaceholder("Add a comment…").fill("With a picture");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  await panel.getByRole("link", { name: "Preview shot.png" }).click();
  const preview = page.getByRole("dialog", { name: "Preview of shot.png" });
  await expect(preview).toBeVisible();

  await preview.getByRole("button", { name: "Zoom in" }).click(); // a press inside the preview
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("on a phone-sized screen the panel fills the screen and can be closed", async ({
  loggedInPage: page,
}) => {
  const { listUrl } = await setup(page);
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(400);
  expect(Math.round(box.height)).toBe(760);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole("button", { name: "Close panel" }).click();
  await expect(panel).toHaveCount(0);
});

test("on a wide screen the panel floats at the right edge with a margin and does not shift the page", async ({
  loggedInPage: page,
}) => {
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  const before = (await cardLink(page, "Alpha issue").boundingBox())!;
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(480);
  expect(Math.round(viewport.width - (box.x + box.width))).toBe(12); // right margin
  expect(Math.round(box.y)).toBe(12); // top margin
  const after = (await cardLink(page, "Alpha issue").boundingBox())!;
  expect(Math.round(after.x)).toBe(Math.round(before.x)); // nothing moved
});

test("the panel never scrolls sideways, and an uploader's hover card opens inside the panel", async ({
  loggedInPage: page,
}) => {
  // Why: hover cards are hidden until hovered, but a hidden card that sticks out past the
  // panel still widens its scrollable area. A name at the right end of the attachments row
  // would add a horizontal scrollbar to the panel (found by eye in the real app).
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel.getByPlaceholder("Add a comment…")).toBeVisible(); // content loaded
  await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Attach files to comment"]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(new File(["hello"], "notes.txt", { type: "text/plain" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await panel.getByPlaceholder("Add a comment…").fill("With a file");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  const row = panel.getByRole("listitem").filter({ hasText: "notes.txt" }).filter({
    has: page.getByRole("button", { name: "Remove" }),
  });
  await expect(row).toBeVisible();

  const body = panel.locator("div.overflow-y-auto");
  expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  await row.getByRole("link", { name: "E2E User" }).hover();
  const card = page.locator('[role="tooltip"]:visible');
  await expect(card).toHaveCount(1);
  const cardBox = (await card.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(cardBox.x).toBeGreaterThanOrEqual(panelBox.x);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
});

for (const scheme of ["light", "dark"] as const) {
  test(`in the panel the attachment cards stand out from the background (${scheme})`, async ({ loggedInPage: page }) => {
    // Why: the panel body used the same colour as the cards inside it, so in dark mode (where
    // the cards' small shadow is invisible) the attachments blended into the panel. The body
    // now uses the page colour, like the full page. Measured, not eyeballed.
    await page.emulateMedia({ colorScheme: scheme });
    const { listUrl } = await setup(page);
    await page.goto(listUrl);
    await cardLink(page, "Alpha issue").click();
    const panel = panelOf(page);
    await expect(panel.getByPlaceholder("Add a comment…")).toBeVisible();
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Attach files to comment"]') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(new File(["hello"], "notes.txt", { type: "text/plain" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await panel.getByPlaceholder("Add a comment…").fill("With a file");
    await panel.getByRole("button", { name: "Comment", exact: true }).click();
    const row = panel.getByRole("listitem").filter({ hasText: "notes.txt" }).filter({
      has: page.getByRole("button", { name: "Remove" }),
    });
    await expect(row).toBeVisible();

    const colours = {
      card: await row.evaluate((el) => getComputedStyle(el).backgroundColor),
      body: await panel.locator("div.overflow-y-auto").evaluate((el) => getComputedStyle(el).backgroundColor),
    };
    expect(colours.card).not.toBe(colours.body);
  });
}
