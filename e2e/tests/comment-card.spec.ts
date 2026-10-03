import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/** Posts a comment through the real form, optionally with one file (set the way the other e2e tests do). */
async function postComment(
  page: import("@playwright/test").Page,
  body: string,
  file?: { name: string; type: string; content: string },
) {
  if (file) {
    await page.evaluate((f) => {
      const input = document.querySelector(
        'input[aria-label="Attach files to comment"]',
      ) as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(new File([f.content], f.name, { type: f.type }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, file);
  }
  await page.getByPlaceholder("Add a comment…").fill(body);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
}

async function openIssue(page: import("@playwright/test").Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Discuss me"],
  });
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(page.getByRole("heading", { name: "Discuss me" })).toBeVisible();
}

test("a comment card shows who, when, the text and its files, and 'edited' after an edit", async ({
  loggedInPage: page,
}) => {
  // Why: the comment card is the owner-picked "header strip" layout (Phase 8.5
  // design pass). The header must carry the author (name and avatar) and the time
  // (with the exact date on hover), the files must be listed inside the card, and an
  // edit must be marked.
  await openIssue(page);
  await postComment(page, "Here is the screenshot", {
    name: "shot.png",
    type: "image/png",
    content: "png-bytes",
  });

  const card = page.locator("li", { hasText: "Here is the screenshot" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "E2E User" })).toBeVisible();
  await expect(card.getByRole("img", { name: "E2E User" })).toHaveText("EU");

  const time = card.locator("time");
  await expect(time).toHaveText(/just now|minute/);
  expect(await time.getAttribute("title")).toMatch(/\d{4}|\d{1,2}[:.]\d{2}/); // an exact date and time
  await expect(card.getByText("(edited)")).toHaveCount(0);

  // The image is a thumbnail tile inside the card: the name is its link label, the size is in its tooltip.
  const chip = card.getByRole("link", { name: /shot\.png/ });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("title", /shot\.png \(\d+(\.\d)? (B|KB)\)/);
  expect(await chip.getAttribute("href")).toContain("/api/v1/attachments/");

  // Edit: marked as edited afterwards.
  await card.getByRole("button", { name: "Edit this comment" }).click();
  await page.getByLabel("Edit comment").fill("Here is the screenshot, fixed typo");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("(edited)")).toBeVisible();
});

test("Edit and Delete stay out of the way until you point at, or tab into, the comment", async ({
  loggedInPage: page,
}) => {
  // Why: a long thread should not be a wall of buttons, but the actions must stay
  // reachable by keyboard. Measured on the real computed opacity.
  await openIssue(page);
  await postComment(page, "A comment with actions");
  const card = page.locator("li", { hasText: "A comment with actions" });
  const edit = card.getByRole("button", { name: "Edit this comment" });
  const opacity = () =>
    edit.evaluate((el) => getComputedStyle(el.parentElement!).opacity);

  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
  expect(await opacity()).toBe("0");

  await card.hover();
  await page.waitForTimeout(350);
  expect(await opacity()).toBe("1");

  await page.mouse.move(0, 0);
  await edit.focus();
  await page.waitForTimeout(350);
  expect(await opacity()).toBe("1");
});

test("on a touch screen the actions are always visible", async ({
  browser,
  loggedInPage: page,
}) => {
  // Why: there is no hover on a phone, so hiding the actions until hover would make
  // Edit and Delete unreachable. A second, touch-emulating context reuses the login
  // by logging in itself.
  await openIssue(page);
  await postComment(page, "Touch me");
  const issueUrl = page.url();

  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 400, height: 800 },
  });
  const phone = await context.newPage();
  await phone.goto("/login");
  await phone.getByLabel("Email").fill("e2e-user@example.com");
  await phone.getByLabel("Password").fill("password123");
  await phone.getByRole("button", { name: "Log in" }).click();
  await expect(phone).toHaveURL(/\/projects$/);
  await phone.goto(new URL(issueUrl).pathname);
  const edit = phone
    .locator("li", { hasText: "Touch me" })
    .getByRole("button", { name: "Edit this comment" });
  await expect(edit).toBeVisible();
  await phone.waitForTimeout(350);
  expect(await edit.evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe(
    "1",
  );
  await context.close();
});

test("deleting asks first, Cancel backs out, and it says files stay", async ({
  loggedInPage: page,
}) => {
  // Why: delete is irreversible for the text, so it must really be gated, and the
  // person must be told what happens to the files (they stay in Attachments).
  await openIssue(page);
  await postComment(page, "Delete me carefully");
  const card = page.locator("li", { hasText: "Delete me carefully" });

  await card.getByRole("button", { name: "Delete this comment" }).click();
  await expect(card.getByText("Any files stay in Attachments.")).toBeVisible();
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByText("Any files stay in Attachments.")).toHaveCount(0);
  await expect(card.getByText("Delete me carefully")).toBeVisible();

  await card.getByRole("button", { name: "Delete this comment" }).click();
  await card.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("Comment deleted")).toBeVisible();
});

test("a very long unbroken word wraps inside the card instead of being cut off or widening the page", async ({
  loggedInPage: page,
}) => {
  // Why: a pasted URL or log line has no spaces to wrap at. The body must break it
  // (break-words). The card clips its contents (overflow-hidden, for the rounded
  // corners), so without that rule the text is silently CUT OFF at the right edge
  // while the page itself still looks fine; so both are checked: the text must fit
  // its own box, and the page must not scroll sideways.
  await openIssue(page);
  await postComment(page, "x".repeat(300));
  await page.setViewportSize({ width: 400, height: 800 });
  const body = page.locator("li p", { hasText: "xxxxxxxxxx" });
  await expect(body).toBeVisible();

  const text = await body.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(text.scroll, "the text is not clipped by its box").toBeLessThanOrEqual(
    text.client,
  );

  const page_ = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(page_.scroll).toBeLessThanOrEqual(page_.client);
});
