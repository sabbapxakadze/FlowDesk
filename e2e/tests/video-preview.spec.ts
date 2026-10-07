import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { makePng } from "../support/png";

/**
 * A real, playable WebM recorded inside the browser (canvas.captureStream +
 * MediaRecorder), so no fixture file is needed and the video has genuine
 * dimensions (160x90) that the tests measure.
 */
async function recordWebm(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext("2d")!;
    const recorder = new MediaRecorder(canvas.captureStream(25), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.start();
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `hsl(${i * 15}, 70%, 50%)`;
      ctx.fillRect(0, 0, 160, 90);
      await new Promise((r) => setTimeout(r, 50));
    }
    recorder.stop();
    await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
}

async function attachAndPost(page: Page, body: string, name: string, type: string, base64: string) {
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
}

async function openIssue(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Look at the clip"],
  });
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(page.getByRole("heading", { name: "Look at the clip" })).toBeVisible();
}

const PNG_800x600 = makePng(800, 600).toString("base64");

test("a video in a comment shows a thumbnail tile with a play badge, not a text chip", async ({
  loggedInPage: page,
}) => {
  // Why: the point of the slice. The tile must show the video's real first frame
  // (measured: the element decoded 160x90), and the file must appear once, as a tile.
  await openIssue(page);
  await attachAndPost(page, "A clip", "clip.webm", "video/webm", await recordWebm(page));
  const card = page.locator("li", { hasText: "A clip" });
  const tile = card.getByRole("link", { name: "Play clip.webm" });
  await expect(tile).toBeVisible();
  await expect(card.getByRole("link", { name: /clip\.webm/ })).toHaveCount(1);

  const video = tile.locator("video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  const box = (await tile.boundingBox())!;
  expect(Math.round(box.width)).toBe(96);
  expect(Math.round(box.height)).toBe(96);
  // The badge is drawn and the tile's video is silent and not auto-playing.
  expect(await video.evaluate((el: HTMLVideoElement) => el.muted && el.paused)).toBe(true);
  await expect(tile.locator("span[aria-hidden='true']")).toBeVisible();
});

test("clicking the video tile opens the popup with player controls, a Download link and no zoom; the media request is a range request", async ({
  loggedInPage: page,
}) => {
  // Why: the popup must play the real file through the signed link, with the
  // browser's own controls (seeking needs the server's 206 answers), and must not
  // offer image zoom for a video. Esc closes and focus returns to the tile.
  await openIssue(page);
  await attachAndPost(page, "Play me", "clip.webm", "video/webm", await recordWebm(page));
  const tile = page
    .locator("li", { hasText: "Play me" })
    .getByRole("link", { name: "Play clip.webm" });
  await expect(tile).toBeVisible();

  const statuses: number[] = [];
  page.on("response", (response) => {
    if (/\/api\/v1\/attachments\/[^/]+\/download/.test(response.url()))
      statuses.push(response.status());
  });

  await tile.click();
  const dialog = page.getByRole("dialog", { name: "Preview of clip.webm" });
  await expect(dialog).toBeVisible();
  const video = dialog.locator("video");
  await expect(video).toHaveAttribute("controls", "");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);

  await expect(dialog.getByRole("button", { name: "Zoom in" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Fit" })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "Download" })).toHaveAttribute(
    "download",
    "clip.webm",
  );
  // Chrome asks media for "Range: bytes=0-"; a server without range support
  // would answer 200 here.
  expect(statuses).toContain(206);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(tile).toBeFocused();
});

test("an image in a comment shows a small thumbnail and opens the zoom popup", async ({
  loggedInPage: page,
}) => {
  // Why: images get the same tile treatment; the tile is the browser-scaled
  // original (natural 800 wide, drawn 96 wide) and still opens the zoomable popup.
  await openIssue(page);
  await attachAndPost(page, "A picture", "shot.png", "image/png", PNG_800x600);
  const tile = page
    .locator("li", { hasText: "A picture" })
    .getByRole("link", { name: "Preview shot.png" });
  await expect(tile).toBeVisible();
  const image = tile.locator("img");
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(800);
  expect(await image.evaluate((el: HTMLImageElement) => el.clientWidth)).toBeLessThanOrEqual(96);

  await tile.click();
  const dialog = page.getByRole("dialog", { name: "Preview of shot.png" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Zoom in" })).toBeVisible();
});

test("a document in a comment is still a text chip that opens in a new tab", async ({
  loggedInPage: page,
  context,
}) => {
  // Why: only images and videos get tiles; PDF/text/CSV keep the chip and the
  // new-tab behaviour (decided with the owner).
  await openIssue(page);
  await attachAndPost(
    page,
    "Notes inside",
    "notes.txt",
    "text/plain",
    Buffer.from("hello").toString("base64"),
  );
  const chip = page
    .locator("li", { hasText: "Notes inside" })
    .getByRole("link", { name: /notes\.txt/ });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("5 B");
  const newTab = context.waitForEvent("page");
  await chip.click();
  await expect(await newTab).toHaveURL(/\/api\/v1\/attachments\//); // a new tab starts at about:blank: wait for it to arrive
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("if the signed link has expired, the comment thumbnail refreshes the link and shows the image", async ({
  loggedInPage: page,
}) => {
  // Why: links live 5 minutes. Simulated by failing the FIRST request for the file
  // with 403 (what an expired link answers) while the thumbnail loads: the list must
  // be refetched and the tile must end up showing the real image, not a broken one.
  await openIssue(page);
  await attachAndPost(page, "Stale tab", "late.png", "image/png", PNG_800x600);
  await expect(
    page.locator("li", { hasText: "Stale tab" }).getByRole("link", { name: "Preview late.png" }),
  ).toBeVisible();

  let fileRequests = 0;
  let listRefetches = 0;
  await page.route(/\/api\/v1\/attachments\/[^/]+\/download/, async (route) => {
    fileRequests += 1;
    if (fileRequests === 1) {
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

  await page.reload();
  const image = page
    .locator("li", { hasText: "Stale tab" })
    .getByRole("link", { name: "Preview late.png" })
    .locator("img");
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(800);
  expect(fileRequests).toBeGreaterThanOrEqual(2);
  expect(listRefetches).toBeGreaterThanOrEqual(2); // the page's own load + the recovery
});

test("a video type the server does not accept is refused before upload with a clear message", async ({
  loggedInPage: page,
}) => {
  // Why: only mp4 and webm are allowed; a .mov (video/quicktime) must be refused by
  // the form using the shared list, and no comment is posted.
  await openIssue(page);
  await page.evaluate(() => {
    const input = document.querySelector(
      'input[aria-label="Attach files to comment"]',
    ) as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(10)], "clip.mov", { type: "video/quicktime" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByText(/clip\.mov.*video\/quicktime.*aren't supported/)).toBeVisible();
});
