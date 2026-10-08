import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

/** An active sprint through the API (the page's own buttons are covered elsewhere). */
async function startSprintViaApi(page: Page, projectId: string, name = "Sprint 1") {
  const { headers, base } = await apiSession(page.request);
  const sprints = `${base}/projects/${projectId}/sprints`;
  const made = await page.request.post(sprints, { headers, data: { name } });
  expect(made.status()).toBe(201);
  const sprint = (await made.json()).data as { id: string; version: number };
  const started = await page.request.patch(`${sprints}/${sprint.id}/start`, { headers, data: { version: sprint.version } });
  expect(started.status()).toBe(200);
}

type LaneName = "Backlog" | "Active sprint";
const lane = (page: Page, name: LaneName) => page.getByRole("group", { name, exact: true });
const WORDS = /\b(One|Two|Three|Four|Issue\d+)\b/;
/** The titles in a lane, top to bottom. */
const titles = async (page: Page, name: LaneName) =>
  (await lane(page, name).getByRole("listitem").allInnerTexts()).map((t) => t.match(WORDS)?.[1] ?? t);

/** A real mouse drag: grab the card, nudge past dnd-kit's activation distance, then glide to the target. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 25 });
  await page.mouse.up();
}
const middle = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test("the newest issue is first in the backlog, and dragging a card above it reorders the list for good", async ({
  loggedInPage: page,
}) => {
  // Why: the owner's rule (new issues on top) and the feature (manual order in the backlog), through the real UI
  // and the real server: the order must survive a reload.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["One", "Two", "Three"],
  });
  await page.goto(`/projects/${projectId}/sprints`);
  await expect.poll(() => titles(page, "Backlog")).toEqual(["Three", "Two", "One"]);

  const one = lane(page, "Backlog").getByRole("listitem").filter({ hasText: "One" });
  const three = lane(page, "Backlog").getByRole("listitem").filter({ hasText: "Three" });
  const oneBox = (await one.boundingBox())!;
  const threeBox = (await three.boundingBox())!;
  await drag(page, middle(oneBox), { x: threeBox.x + threeBox.width / 2, y: threeBox.y + 6 });

  await expect.poll(() => titles(page, "Backlog")).toEqual(["One", "Three", "Two"]);
  await expect(page).toHaveURL(/\/sprints$/); // a drop is not a click
  await page.reload();
  await expect.poll(() => titles(page, "Backlog")).toEqual(["One", "Three", "Two"]);
});

test("a card dropped between two cards of the active sprint lands exactly there, and the sprint list reorders too", async ({
  loggedInPage: page,
}) => {
  // Why: dropping across lists carries a position; the sprint is ordered like the backlog.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Four", "Three", "Two", "One"], // backlog reads One, Two, Three, Four
  });
  await startSprintViaApi(page, projectId);
  await page.goto(`/projects/${projectId}/sprints`);
  await expect.poll(() => titles(page, "Backlog")).toEqual(["One", "Two", "Three", "Four"]);

  const sprintLane = lane(page, "Active sprint");
  const card = (name: string) => lane(page, "Backlog").getByRole("listitem").filter({ hasText: name });

  // Into the empty sprint: One, then Two after it.
  await drag(page, middle((await card("One").boundingBox())!), middle((await sprintLane.boundingBox())!));
  await expect.poll(() => titles(page, "Active sprint")).toEqual(["One"]);
  await drag(page, middle((await card("Two").boundingBox())!), middle((await sprintLane.boundingBox())!));
  await expect.poll(() => titles(page, "Active sprint")).toEqual(["One", "Two"]);

  // Three between One and Two.
  const sprintOne = (await sprintLane.getByRole("listitem").filter({ hasText: "One" }).boundingBox())!;
  await drag(page, middle((await card("Three").boundingBox())!), { x: sprintOne.x + sprintOne.width / 2, y: sprintOne.y + sprintOne.height - 4 });
  await expect.poll(() => titles(page, "Active sprint")).toEqual(["One", "Three", "Two"]);
  await expect.poll(() => titles(page, "Backlog")).toEqual(["Four"]);

  // Reorder inside the sprint: Two to the top.
  const two = (await sprintLane.getByRole("listitem").filter({ hasText: "Two" }).boundingBox())!;
  const first = (await sprintLane.getByRole("listitem").first().boundingBox())!;
  await drag(page, middle(two), { x: first.x + first.width / 2, y: first.y + 4 });
  await expect.poll(() => titles(page, "Active sprint")).toEqual(["Two", "One", "Three"]);

  await page.reload();
  await expect.poll(() => titles(page, "Active sprint")).toEqual(["Two", "One", "Three"]);
  await expect.poll(() => titles(page, "Backlog")).toEqual(["Four"]);
});

test("a long backlog scrolls inside its own lane: the page does not grow, and the board does the same", async ({
  loggedInPage: page,
}) => {
  // Why: item 6 of the owner's list. 30 issues used to make the whole page 30 cards long.
  // A window tall enough for the sprints page's minimum height (it scrolls a little below that, by design).
  await page.setViewportSize({ width: 1280, height: 900 });
  const many = Array.from({ length: 30 }, (_, i) => `Issue${i + 1}`);
  const { projectId } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: many });

  for (const [url, group] of [
    [`/projects/${projectId}/sprints`, "Backlog"],
    [`/projects/${projectId}/board`, "Todo"],
  ] as const) {
    await page.goto(url);
    const body = page.getByRole("group", { name: group, exact: true });
    await expect(body.getByRole("listitem").first()).toBeVisible();
    // The page itself fits the window...
    const pageFits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
    expect(pageFits, `${url}: the page should not scroll`).toBe(true);
    // ...and the lane's body is what scrolls.
    const scroller = body.locator(".scrollbar-list-always");
    const { scrollable, before } = await scroller.evaluate((el) => ({ scrollable: el.scrollHeight > el.clientHeight + 50, before: el.scrollTop }));
    expect(scrollable, `${url}: the lane should scroll inside`).toBe(true);
    await scroller.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  }
});

test("in a short window the sprints page scrolls, and the lists end with space under them instead of touching the window's bottom edge", async ({
  loggedInPage: page,
}) => {
  // Why: below about 830px of window height the page reserved less room than the two lists' own minimum (16rem), so they hung out below the
  // page: scrolled to the end, they were flush against the bottom of the window with no space (found by the owner scrolling down).
  await page.setViewportSize({ width: 1280, height: 640 });
  const { projectId } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["One", "Two"] });
  // Enough sprints to fill the capped Sprints list (19rem): with a short list the lanes have room and the bug does not show.
  const { headers, base } = await apiSession(page.request);
  for (let i = 1; i <= 6; i++) {
    const made = await page.request.post(`${base}/projects/${projectId}/sprints`, { headers, data: { name: `Sprint ${i}` } });
    expect(made.status()).toBe(201);
  }
  await page.goto(`/projects/${projectId}/sprints`);
  await expect(lane(page, "Backlog").getByRole("listitem").first()).toBeVisible();

  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
  expect(scrolls, "a window this short must scroll the page").toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  for (const name of ["Backlog", "Active sprint"] as const) {
    const box = (await lane(page, name).boundingBox())!;
    expect(box.height, `${name} keeps its minimum height of 16rem`).toBeGreaterThanOrEqual(256);
    const spaceBelow = await page.evaluate(() => window.innerHeight) - (box.y + box.height);
    expect(spaceBelow, `${name}: space under the list at the end of the page`).toBeGreaterThanOrEqual(24);
  }
});

test("dragging a card near the bottom edge of a long list scrolls the list and drops it far down", async ({
  loggedInPage: page,
}) => {
  // Why: inside a scrolling lane the drag must auto-scroll, or a card could never be moved past the visible part.
  await page.setViewportSize({ width: 1280, height: 900 });
  const many = Array.from({ length: 30 }, (_, i) => `Issue${i + 1}`);
  const { projectId } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: many });
  await page.goto(`/projects/${projectId}/sprints`);
  const backlog = lane(page, "Backlog");
  const first = backlog.getByRole("listitem").first(); // Issue30 (the newest is on top)
  await expect(first).toContainText("Issue30");
  const laneBox = (await backlog.boundingBox())!;
  const from = middle((await first.boundingBox())!);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 5 });
  await page.mouse.move(from.x, laneBox.y + laneBox.height - 12, { steps: 20 });
  await page.waitForTimeout(2500); // hold near the bottom edge: dnd-kit scrolls the lane
  await page.mouse.up();

  const order = await titles(page, "Backlog");
  expect(order.indexOf("Issue30"), `order after the drop: ${order.join(", ")}`).toBeGreaterThan(8); // it travelled well past the first screenful
  await page.reload();
  await expect.poll(async () => (await titles(page, "Backlog")).indexOf("Issue30")).toBeGreaterThan(8);
});
