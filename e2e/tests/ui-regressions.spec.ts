import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

test("the issues list does not scroll sideways on a narrow screen", async ({
  loggedInPage: page,
}) => {
  // Why: found by hand on 2026-10-01. The status, priority and assignee filters
  // plus the sort button did not wrap, so the sort button was cut off and the page
  // scrolled sideways on a phone. Measured, not eyeballed: the document must not
  // be wider than the window.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["One issue"],
  });
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByLabel("Filter by assignee")).toBeVisible();

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  // The last control in the row is reachable (inside the window), not cut off.
  const sort = page.getByRole("button", { name: /first$/ });
  const box = (await sort.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(widths.client);
});

test("in a long search list, arrowing to 'Show all results' keeps that row on screen", async ({
  loggedInPage: page,
}) => {
  // Why: found by hand on 2026-10-01. The 'Show all results' row sat at the very
  // bottom of a scrolling list and was not scrolled into view when highlighted, so
  // keyboard users could press Enter on a row they could not see. It is now pinned
  // to the bottom of the list.
  await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: Array.from({ length: 12 }, (_, i) => `Findable thing ${i + 1}`),
  });
  await page.goto("/projects");
  // The shortcut is only attached once the session has been restored (the palette
  // renders nothing while logged out), so wait for the signed-in page first.
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Search/ }).first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search issues").fill("findable");
  const showAll = page.getByRole("option", { name: /Show all results/ });
  await expect(showAll).toBeVisible();

  const inList = async (row: typeof showAll) => {
    const list = (await page.getByRole("listbox").boundingBox())!;
    const box = (await row.boundingBox())!;
    return box.y >= list.y - 1 && box.y + box.height <= list.y + list.height + 1;
  };

  // Visible from the start, even though there are more rows than fit...
  expect(await inList(showAll)).toBe(true);
  const options = await page.getByRole("option").count();
  expect(options).toBeGreaterThan(10);

  // ...and still visible once the keyboard highlight has walked to it.
  for (let i = 0; i < options + 2; i++) await page.keyboard.press("ArrowDown");
  await expect(showAll).toHaveAttribute("aria-selected", "true");
  expect(await inList(showAll)).toBe(true);
});
