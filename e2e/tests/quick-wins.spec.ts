import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi, setIssuePriorityViaApi } from "../support/api";
import { combobox, expectValue, pick } from "../support/dropdown";

/**
 * Three small things: the "C" shortcut on the issues page, "Lowest priority first" in the sort, and the audit log's
 * Load more growing inside its own panel.
 */

const title = (page: Page) => page.getByPlaceholder("Something to do"); // (not by label: the badge sits inside the label)
const titlesOf = (page: Page) =>
  page.locator('ul > li a[href*="/issues/"] p.font-medium').allInnerTexts().then((texts) => texts.map((t) => t.trim()));

test.describe("the C shortcut", () => {
  test("C puts the cursor in the new-issue title; typing C in a field, Ctrl+C, and a shortcut with a panel open do not", async ({
    loggedInPage: page,
  }) => {
    // Why: a one-key shortcut is only safe if it never steals a letter. The guards are the whole feature.
    await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Alpha"] });
    await page.goto("/projects/WEB");
    await expect(page.getByRole("link", { name: /Alpha/ }).first()).toBeVisible();

    await page.keyboard.press("c");
    await expect(title(page)).toBeFocused();
    await expect(title(page)).toHaveValue(""); // the key itself was not typed into the field

    // Typing a "c" in a field is typing.
    await page.keyboard.type("cabbage");
    await expect(title(page)).toHaveValue("cabbage");
    await page.getByLabel("Description", { exact: true }).fill("");
    await page.getByLabel("Description", { exact: true }).focus();
    await page.keyboard.type("c");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("c");
    await expect(title(page)).not.toBeFocused();

    // With a modifier it is a different shortcut (copy).
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+c");
    await expect(title(page)).not.toBeFocused();

    // With the issue panel open (focus inside it) it does nothing to the page behind.
    await page.getByRole("link", { name: /Alpha/ }).first().click();
    const panel = page.locator('section[aria-label="Issue"]');
    await expect(panel).toBeFocused();
    await page.keyboard.press("c");
    await page.waitForTimeout(200);
    await expect(panel).toBeFocused(); // focus did not jump to the title field behind the panel
  });
});

test("the sort offers Lowest priority first: no priority, then low to urgent, oldest first within each; the choice is in the URL", async ({
  loggedInPage: page,
}) => {
  // Why: the API already supported it; the list had no way to ask. The whole key flips, so an issue without a priority
  // (the lowest) comes first.
  const issues = [
    { title: "Low one", priority: "low" },
    { title: "Urgent one", priority: "urgent" },
    { title: "Unranked", priority: "none" },
    { title: "High one", priority: "high" },
    { title: "Medium one", priority: "medium" },
    { title: "Urgent two", priority: "urgent" },
  ] as const;
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: issues.map((i) => i.title),
  });
  for (const [index, issue] of issues.entries()) {
    if (issue.priority !== "none") await setIssuePriorityViaApi(page.request, projectId, issueIds[index]!, issue.priority);
  }

  await page.goto("/projects/WEB");
  const sort = combobox(page, "Sort");
  await pick(sort, "Lowest priority first");
  await expect(page).toHaveURL(/sort=priority/);
  await expect(page).toHaveURL(/order=asc/);
  await expectValue(sort, "priority-low");
  await expect.poll(() => titlesOf(page)).toEqual(["Unranked", "Low one", "Medium one", "High one", "Urgent one", "Urgent two"]);

  await page.reload();
  await expectValue(combobox(page, "Sort"), "priority-low");
  await expect.poll(() => titlesOf(page)).toEqual(["Unranked", "Low one", "Medium one", "High one", "Urgent one", "Urgent two"]);

  // Back to Highest: the ascending flag is dropped, not kept.
  await pick(combobox(page, "Sort"), "Highest priority first");
  await expect(page).not.toHaveURL(/order=/);
  await expect.poll(() => titlesOf(page)).toEqual(["Urgent two", "Urgent one", "High one", "Medium one", "Low one", "Unranked"]);
});

test("audit log: Load more adds rows inside the panel, and the page keeps its height", async ({ loggedInPage: page }) => {
  // Why: the same stretching the issues list and the profile had.
  await page.setViewportSize({ width: 1280, height: 800 });
  await createIssueViaApi(page.request, { projectName: "First", projectKey: "AAA", titles: [] });
  const { headers, base } = await apiSession(page.request);
  for (let i = 0; i < 29; i++) {
    const res = await page.request.post(`${base}/projects`, { headers, data: { name: `Project ${i}`, key: `P${String(i).padStart(2, "0")}X` } });
    expect(res.status()).toBe(201);
  }
  await page.goto("/audit-log");
  const panel = page.getByRole("group", { name: "Audit log entries" });
  await expect(panel.getByRole("listitem").first()).toBeVisible();
  const height = () => page.evaluate(() => document.documentElement.scrollHeight);
  const before = await height();
  const box = await panel.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(box.scroll).toBeGreaterThan(box.client); // 25 rows already scroll inside it

  const button = panel.getByRole("button", { name: "Load more" });
  const area = (await panel.boundingBox())!;
  const at = (await button.boundingBox())!;
  expect(at.y).toBeGreaterThanOrEqual(area.y); // the button is pinned fully inside the panel
  expect(at.y + at.height).toBeLessThanOrEqual(area.y + area.height + 0.5);

  await button.click();
  await expect(panel.getByRole("listitem")).toHaveCount(30);
  expect(await height()).toBe(before);
});

test("a small C badge in the empty title field says the shortcut exists, and goes away on focus or typing", async ({
  loggedInPage: page,
}) => {
  // Why: the shortcut worked but nothing on the page mentioned it.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Alpha"] });
  await page.goto("/projects/WEB");
  const badge = page.locator("kbd", { hasText: /^C$/ });
  await expect(badge).toBeVisible();
  // The badge's wrapper must not shrink the field: Title and Description are the same width (both flex-1).
  const titleWidth = (await title(page).boundingBox())!.width;
  const descriptionWidth = (await page.getByPlaceholder("Optional").boundingBox())!.width;
  expect(Math.abs(titleWidth - descriptionWidth)).toBeLessThan(1);

  await page.keyboard.press("c"); // the shortcut focuses the field...
  await expect(title(page)).toBeFocused();
  await expect(badge).toBeHidden(); // ...and the badge steps aside

  await page.keyboard.type("x");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(title(page)).toHaveValue("x");
  await expect(badge).toBeHidden(); // text in the field: still no badge

  await title(page).fill(""); // (filling focuses the field)
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(badge).toBeVisible(); // empty and not focused again

  // A phone has no keyboard: no badge.
  await page.setViewportSize({ width: 400, height: 800 });
  await expect(badge).toBeHidden();
});
