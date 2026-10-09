import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createCommentViaApi, createIssueViaApi } from "../support/api";

/**
 * The comment editor (ADR 0056): formatted while you type, a toolbar and keyboard shortcuts, a link box, and the Markdown it stores. The pure
 * parts (Markdown in and out, what the schema allows) are tested in apps/web/src/shared/ui/rich-text/extensions.test.ts; these tests are about the
 * real browser: typing, focus, the shortcuts reaching the editor, and what the comment card then shows.
 */

const box = (page: Page) => page.getByRole("textbox", { name: "Comment", exact: true });
const tool = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name} \\(`) });

async function openIssue(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Discuss me"],
  });
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(page.getByRole("heading", { name: "Discuss me" })).toBeVisible();
  await expect(box(page)).toBeVisible(); // the editor has arrived (it is loaded on demand)
  return { projectId, issueId: issueIds[0]! };
}

const post = (page: Page) => page.getByRole("button", { name: "Comment", exact: true }).click();

test("shortcuts and toolbar format what you type, the buttons show what is on, and the posted comment shows it", async ({ loggedInPage: page }) => {
  // Why: this is the feature: bold, italic, strikethrough and code from the keyboard and from the mouse, ending in a comment that looks the part.
  await openIssue(page);
  await box(page).click();

  await page.keyboard.press("Control+b");
  await expect(tool(page, "Bold")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type("bold");
  await page.keyboard.press("Control+b");
  await expect(tool(page, "Bold")).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.type(" ");
  await page.keyboard.press("Control+i");
  await page.keyboard.type("slanted");
  await page.keyboard.press("Control+i");

  await page.keyboard.type(" ");
  await page.keyboard.press("Control+Shift+x");
  await page.keyboard.type("gone");
  await page.keyboard.press("Control+Shift+x");

  await page.keyboard.type(" ");
  await tool(page, "Code").click(); // the mouse: the editor must keep its selection and focus while a button is pressed
  await page.keyboard.type("code");

  await expect(box(page).locator("strong")).toHaveText("bold");
  await post(page);

  const card = page.locator("li", { hasText: "slanted" }).first();
  await expect(card.locator("strong")).toHaveText("bold");
  await expect(card.locator("em")).toHaveText("slanted");
  await expect(card.locator("s")).toHaveText("gone");
  await expect(card.locator("code")).toHaveText("code");
  await expect(box(page)).toHaveText(""); // the box is empty again for the next comment
});

test("typing Markdown marks makes the formatting, and a list is made from the toolbar or by typing a dash", async ({ loggedInPage: page }) => {
  // Why: people who know Markdown will type it. Both ways to start a list must end the same.
  await openIssue(page);
  await box(page).click();
  await page.keyboard.type("**loud** ");
  await expect(box(page).locator("strong")).toHaveText("loud");
  await page.keyboard.press("Enter");

  await tool(page, "Bulleted list").click();
  await page.keyboard.type("first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await post(page);

  const card = page.locator("li", { hasText: "loud" }).first();
  await expect(card.locator("strong")).toHaveText("loud");
  await expect(card.locator("ul > li")).toHaveText(["first", "second"]);
});

test("the link box refuses an unsafe address, accepts a safe one, and the card draws a real link", async ({ loggedInPage: page }) => {
  // Why: Ctrl+Shift+K is the link shortcut (Ctrl+K belongs to the search palette). An address like javascript: must never become a link.
  await openIssue(page);
  await box(page).click();
  await page.keyboard.type("see the docs");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+Shift+k");

  const address = page.getByRole("textbox", { name: "Link address" });
  await expect(address).toBeFocused();
  await address.fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("alert")).toContainText("https://");
  await expect(box(page).locator("a")).toHaveCount(0);

  await address.fill("example.com/docs"); // no scheme typed: https:// is added
  await address.press("Enter");
  await expect(box(page).locator("a")).toHaveAttribute("href", "https://example.com/docs");
  await post(page);

  const card = page.locator("li", { hasText: "see the docs" }).first();
  const link = card.getByRole("link", { name: "see the docs" });
  await expect(link).toHaveAttribute("href", "https://example.com/docs");
  expect(await link.getAttribute("rel")).toContain("noopener");
});

test("Ctrl+K inside the editor still opens the search palette", async ({ loggedInPage: page }) => {
  // Why: the editor's link shortcut is Ctrl+Shift+K precisely so this keeps working from the comment box.
  await openIssue(page);
  await box(page).click();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox").first()).toBeVisible();
});

test("editing a formatted comment shows its formatting in the editor and keeps it on Save; an old multi-line comment keeps its lines", async ({
  loggedInPage: page,
}) => {
  // Why: opening a comment for editing must not strip formatting or glue lines together, including comments written before formatting existed.
  const { projectId, issueId } = await openIssue(page);
  await createCommentViaApi(page.request, projectId, issueId, "**bold** start");
  await createCommentViaApi(page.request, projectId, issueId, "line one\nline two");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Discuss me" })).toBeVisible();

  const formatted = page.locator("li", { hasText: "start" }).first();
  await formatted.hover();
  await formatted.getByRole("button", { name: "Edit this comment" }).click();
  const edit = page.getByRole("textbox", { name: "Edit comment", exact: true });
  await expect(edit.locator("strong")).toHaveText("bold");
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled(); // nothing changed yet
  await edit.press("End");
  await page.keyboard.type(" and more");
  await save.click();
  await expect(formatted.locator("strong")).toHaveText("bold");
  await expect(formatted).toContainText("start and more");

  const plain = page.locator("li", { hasText: "line two" }).first();
  await plain.hover();
  await plain.getByRole("button", { name: "Edit this comment" }).click();
  const editPlain = page.getByRole("textbox", { name: "Edit comment", exact: true });
  await editPlain.press("Control+End");
  await page.keyboard.type("!");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(plain).toContainText("line two!");
  await expect(plain.locator("br")).toHaveCount(1); // the two lines are still two lines
});

test("pasting a web page's HTML keeps only the allowed formatting: no heading, no script, no image", async ({ loggedInPage: page }) => {
  // Why: people paste from documents and web pages. The editor throws away everything the comment card cannot draw.
  await openIssue(page);
  await box(page).click();
  await page.evaluate(() => {
    const target = document.querySelector('[role="textbox"][aria-label="Comment"]') as HTMLElement;
    const data = new DataTransfer();
    data.setData("text/html", '<h1>Big title</h1><p>Some <b>bold</b> text <img src="x" onerror="window.__pwned=1"><script>window.__pwned=2</script></p>');
    data.setData("text/plain", "Big title Some bold text");
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(box(page).locator("h1, img, script")).toHaveCount(0);
  await expect(box(page).locator("strong")).toHaveText("bold");
  await post(page);

  const card = page.locator("li", { hasText: "Some" }).first();
  await expect(card).toContainText("Big title");
  await expect(card.locator("h1, img, script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});
