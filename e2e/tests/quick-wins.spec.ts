import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi, setIssuePriorityViaApi } from "../support/api";
import { combobox, expectValue, pick } from "../support/dropdown";

/**
 * Three small things: the "C" shortcut on the issues page, "Lowest priority first" in the sort, and the audit log's
 * Load more growing inside its own panel.
 */

const newIssueButton = (page: Page) => page.getByRole("button", { name: /New issue/ });
const createDialog = (page: Page) => page.getByRole("dialog", { name: "New issue" });
const titlesOf = (page: Page) =>
  page.locator('ul > li a[href*="/issues/"] p.font-medium').allInnerTexts().then((texts) => texts.map((t) => t.trim()));

test.describe("the C shortcut", () => {
  test("C opens the New issue popup; typing C in a field, Ctrl+C, and a shortcut with the issue panel focused do not", async ({
    loggedInPage: page,
  }) => {
    // Why: a one-key shortcut is only safe if it never steals a letter. The guards are the whole feature.
    await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Alpha"] });
    await page.goto("/projects/WEB");
    await expect(page.getByRole("link", { name: /Alpha/ }).first()).toBeVisible();

    await page.keyboard.press("c");
    await expect(createDialog(page)).toBeVisible();
    await expect(createDialog(page).getByLabel("Title")).toBeFocused();
    await expect(createDialog(page).getByLabel("Title")).toHaveValue(""); // the key itself was not typed into the field

    // Typing a "c" in a field is typing: it must not open a second popup or change focus.
    await page.keyboard.type("cabbage");
    await expect(createDialog(page).getByLabel("Title")).toHaveValue("cabbage");
    await expect(createDialog(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(createDialog(page)).toHaveCount(0);

    // With a modifier it is a different shortcut (copy).
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+c");
    await expect(createDialog(page)).toHaveCount(0);

    // With the issue panel open (focus inside it) it does nothing to the page behind.
    await page.getByRole("link", { name: /Alpha/ }).first().click();
    const panel = page.locator('section[aria-label="Issue"]');
    await expect(panel).toBeFocused();
    await page.keyboard.press("c");
    await page.waitForTimeout(200);
    await expect(createDialog(page)).toHaveCount(0);
    await expect(panel).toBeFocused();
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

test("the New issue button shows a small C badge saying the shortcut exists, and a phone (no keyboard) hides it", async ({
  loggedInPage: page,
}) => {
  // Why: the shortcut worked but nothing on the page mentioned it.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Alpha"] });
  await page.goto("/projects/WEB");
  const badge = newIssueButton(page).locator("kbd", { hasText: /^C$/ });
  await expect(badge).toBeVisible();
  await page.setViewportSize({ width: 400, height: 800 });
  await expect(badge).toBeHidden();
});
