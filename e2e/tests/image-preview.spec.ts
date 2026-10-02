import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { makePng } from "../support/png";

/** Posts a comment with one file, set on the comment's picker the way the other e2e tests do. */
async function postCommentWithFile(
  page: Page,
  body: string,
  name: string,
  type: string,
  base64: string,
) {
  await page.evaluate(
    (f) => {
      const input = document.querySelector(
        'input[aria-label="Attach files to comment"]',
      ) as HTMLInputElement;
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], f.name, { type: f.type }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { name, type, base64 },
  );
  await page.getByPlaceholder("Add a comment…").fill(body);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(
    page.locator("li", { hasText: body }).getByRole("link", { name }),
  ).toBeVisible();
}

async function openIssue(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Look at the picture"],
  });
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(page.getByRole("heading", { name: "Look at the picture" })).toBeVisible();
}

const PNG_800x600 = makePng(800, 600).toString("base64");

async function openPreview(page: Page) {
  await openIssue(page);
  await postCommentWithFile(
    page,
    "Here is the picture",
    "shot.png",
    "image/png",
    PNG_800x600,
  );
  const chip = page
    .locator("li", { hasText: "Here is the picture" })
    .getByRole("link", { name: /shot\.png/ });
  await chip.click();
  const dialog = page.getByRole("dialog", { name: "Preview of shot.png" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.locator("img").evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(800);
  return { chip, dialog };
}

test("an image opens in a preview popup with its name, size and a Download link; Esc closes it and focus returns", async ({
  loggedInPage: page,
}) => {
  // Why: the point of the slice. The popup must show the real image, say what it is,
  // offer a download that really downloads (the `download` attribute), and behave
  // like a proper modal: Esc closes it and focus goes back to what opened it.
  const { chip, dialog } = await openPreview(page);
  await expect(dialog.getByText("shot.png", { exact: true })).toBeVisible();
  await expect(dialog).toContainText(/\d+(\.\d)? (B|KB)/);

  const download = dialog.getByRole("link", { name: "Download" });
  await expect(download).toHaveAttribute("download", "shot.png");
  expect(await download.getAttribute("href")).toContain("/api/v1/attachments/");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(chip).toBeFocused();

  // It can be opened again afterwards (the open state really reset).
  await chip.click();
  await expect(page.getByRole("dialog", { name: "Preview of shot.png" })).toBeVisible();
});

test("clicking outside the popup, or Close, dismisses it", async ({
  loggedInPage: page,
}) => {
  const { dialog } = await openPreview(page);
  await page.mouse.click(4, 4); // the dimmed area
  await expect(dialog).toHaveCount(0);

  await page
    .locator("li", { hasText: "Here is the picture" })
    .getByRole("link", { name: /shot\.png/ })
    .click();
  await page
    .getByRole("dialog", { name: "Preview of shot.png" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("zoom in, zoom out and Fit change the drawn size, by button and by keyboard, and the percentage follows", async ({
  loggedInPage: page,
}) => {
  // Why: zoom is measured on the real drawn width of the real image, not assumed.
  const { dialog } = await openPreview(page);
  const image = dialog.locator("img");
  const width = () => image.evaluate((el: HTMLImageElement) => el.clientWidth);
  const percent = async () =>
    Number((await dialog.getByText(/^\d+%$/).innerText()).replace("%", ""));

  const fitWidth = await width();
  const fitPercent = await percent();
  expect(fitWidth).toBeLessThan(800); // fitted, not shown at full size
  expect(fitPercent).toBeLessThan(100);

  await dialog.getByRole("button", { name: "Zoom in" }).click();
  const zoomed = await width();
  expect(zoomed).toBeGreaterThan(fitWidth);
  expect(await percent()).toBeGreaterThan(fitPercent);

  await dialog.getByRole("button", { name: "Zoom out" }).click();
  await dialog.getByRole("button", { name: "Zoom out" }).click();
  expect(await width()).toBeLessThan(zoomed);

  await dialog.getByRole("button", { name: "Fit" }).click();
  await expect.poll(width).toBe(fitWidth);

  // Keyboard: + and - zoom, 0 returns to fit.
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  const viaKeys = await width();
  expect(viaKeys).toBeGreaterThan(fitWidth);
  await page.keyboard.press("-");
  expect(await width()).toBeLessThan(viaKeys);
  await page.keyboard.press("0");
  await expect.poll(width).toBe(fitWidth);
});

test("the issue's Attachments list opens the same popup for an image", async ({
  loggedInPage: page,
}) => {
  // Why: there are two places an attachment is linked (the list and the comment chip);
  // both must behave the same.
  await openIssue(page);
  await postCommentWithFile(
    page,
    "Same file, two places",
    "list-shot.png",
    "image/png",
    PNG_800x600,
  );
  const inList = page
    .getByRole("listitem")
    .filter({ hasText: "from a comment" })
    .getByRole("link", { name: "list-shot.png" });
  await inList.click();
  await expect(
    page.getByRole("dialog", { name: "Preview of list-shot.png" }),
  ).toBeVisible();
});

test("a file that is not an image does not open the popup; it opens as a link in a new tab", async ({
  loggedInPage: page,
  context,
}) => {
  // Why: only images are previewed in this slice. Text, CSV and PDF keep the old behaviour.
  await openIssue(page);
  await postCommentWithFile(
    page,
    "Some notes",
    "notes.txt",
    "text/plain",
    Buffer.from("hello notes").toString("base64"),
  );
  const link = page
    .locator("li", { hasText: "Some notes" })
    .getByRole("link", { name: /notes\.txt/ });
  const newTab = context.waitForEvent("page");
  await link.click();
  const tab = await newTab;
  expect(tab.url()).toContain("/api/v1/attachments/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("if the signed link has expired, the preview refreshes the link and shows the image", async ({
  loggedInPage: page,
}) => {
  // Why: download links live 5 minutes and are minted when the list is fetched, so a
  // page left open a long time has stale links. Simulated by making the FIRST request
  // for the image fail with 403 (what an expired link answers); the preview must refetch
  // the attachment list and ask again, and the image must appear.
  await openIssue(page);
  await postCommentWithFile(page, "Old tab", "late.png", "image/png", PNG_800x600);

  let imageRequests = 0;
  let listRefetches = 0;
  await page.route(/\/api\/v1\/attachments\/[^/]+\/download/, async (route) => {
    imageRequests += 1;
    if (imageRequests === 1) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: '{"error":{"code":"invalid_download_link"}}',
      });
    } else {
      await route.continue();
    }
  });
  page.on("request", (request) => {
    if (
      /\/issues\/[^/]+\/attachments$/.test(new URL(request.url()).pathname) &&
      request.method() === "GET"
    )
      listRefetches += 1;
  });

  await page
    .locator("li", { hasText: "Old tab" })
    .getByRole("link", { name: /late\.png/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Preview of late.png" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.locator("img").evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(800);
  expect(imageRequests).toBeGreaterThanOrEqual(2);
  expect(listRefetches).toBeGreaterThanOrEqual(1);
});

test("on a phone-sized screen the popup fits inside the window with its controls reachable", async ({
  loggedInPage: page,
}) => {
  await openIssue(page);
  await postCommentWithFile(page, "Phone view", "shot.png", "image/png", PNG_800x600);
  await page.setViewportSize({ width: 400, height: 760 });
  await page
    .locator("li", { hasText: "Phone view" })
    .getByRole("link", { name: /shot\.png/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Preview of shot.png" });
  await expect(dialog).toBeVisible();

  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(400);
  expect(box.y + box.height).toBeLessThanOrEqual(760);
  for (const name of ["Zoom in", "Zoom out", "Fit", "Close"]) {
    const control = (await dialog
      .getByRole("button", { name, exact: true })
      .boundingBox())!;
    expect(control.x + control.width).toBeLessThanOrEqual(400);
  }
  const download = (await dialog.getByRole("link", { name: "Download" }).boundingBox())!;
  expect(download.x + download.width).toBeLessThanOrEqual(400);
});
