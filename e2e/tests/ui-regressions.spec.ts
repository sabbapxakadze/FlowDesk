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
  const sort = page.getByLabel("Sort");
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

test("Save is green and Delete is red", async ({ loggedInPage: page }) => {
  // Why: the owner asked for it (2026-10-01): a Save button that looks like every
  // other dark button, and a Delete that does not look dangerous, are easy to click
  // wrongly. Checked on the computed colours: green is the dominant channel of the
  // Save button, red of the Delete opener and of the (stronger) final confirm.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["x"],
  });
  await page.goto(`/projects/${projectId}/settings`);

  const channels = (
    locator: ReturnType<typeof page.getByRole>,
    property: "backgroundColor" | "borderTopColor",
  ) =>
    locator.evaluate((el, prop) => {
      const css = getComputedStyle(el)[prop];
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return { r: r!, g: g!, b: b! };
    }, property);

  // Save becomes available once the name changes.
  await page.getByLabel("Project name").fill("Website 2");
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeEnabled();
  const green = await channels(save, "backgroundColor");
  expect(green.g).toBeGreaterThan(green.r + 40);
  expect(green.g).toBeGreaterThan(green.b);

  // Delete: a solid red first, a STRONGER red for the final confirm.
  const opener = page.getByRole("button", { name: "Delete project" });
  const first = await channels(opener, "backgroundColor");
  expect(first.r).toBeGreaterThan(first.g + 60);
  expect(first.r).toBeGreaterThan(first.b + 60);

  await opener.click();
  await page.getByLabel("Confirm project name").fill("Website");
  const confirm = page.getByRole("button", { name: "Delete this project" });
  await expect(confirm).toBeEnabled();
  await page.waitForTimeout(400); // the opacity transition from the disabled look
  const strong = await channels(confirm, "backgroundColor");
  expect(strong.r).toBeGreaterThan(strong.g + 60);
  expect(strong.r).toBeGreaterThan(strong.b + 60);
  // Stronger = a visibly different red from the first click. (Light mode here:
  // darker; in dark mode it is brighter instead.)
  expect(strong.r).toBeLessThan(first.r - 30);
});

for (const scheme of ["light", "dark"] as const) {
  test(`Save and Delete get a deeper colour on hover, readable, with a ring in dark mode (${scheme})`, async ({
    page,
  }) => {
    // Why: the owner asked for proper hover states (2026-10-01). A brighter hover
    // would drop the white text below 4.5:1 on the green and the strong red in dark
    // mode, so hover is a DEEPER shade in both themes; dark mode adds a soft light
    // ring so the darker button does not sink into the dark page. Read from the real
    // computed styles on the public design-system page (no login needed).
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/design-system");

    type Sample = { bg: number[]; text: number[]; ringAlpha: number };
    const sample = async (name: string, hover: boolean): Promise<Sample> => {
      const button = page
        .locator("section", { hasText: "Success (Save) and danger" })
        .first()
        .getByRole("button", { name, exact: true });
      if (hover) await button.hover();
      else await page.mouse.move(0, 0);
      await page.waitForTimeout(350); // let the colour transition finish
      return button.evaluate((el) => {
        const rgba = (css: string) => {
          const c = document.createElement("canvas");
          c.width = c.height = 1;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#000";
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0]!, d[1]!, d[2]!];
        };
        const cs = getComputedStyle(el);
        // box-shadow is a list (Tailwind stacks several, most of them transparent
        // zero-width rings). Find the one with a real spread and read its alpha
        // through a canvas, which understands rgb(), oklch() and oklab() alike.
        const alphaOf = (css: string) => {
          const c = document.createElement("canvas");
          c.width = c.height = 1;
          const ctx = c.getContext("2d")!;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          return ctx.getImageData(0, 0, 1, 1).data[3]! / 255;
        };
        let alpha = 0;
        for (const m of cs.boxShadow.matchAll(
          /((?:rgba?|oklch|oklab|color)\([^)]*\))\s+0px 0px 0px (\d+)px/g,
        )) {
          if (Number(m[2]) > 0) alpha = Math.max(alpha, alphaOf(m[1]!));
        }
        return { bg: rgba(cs.backgroundColor), text: rgba(cs.color), ringAlpha: alpha };
      });
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const contrast = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };

    for (const name of ["Save", "Delete", "Delete project"]) {
      const rest = await sample(name, false);
      const hovered = await sample(name, true);
      // Deeper: the hovered fill is darker than the resting fill...
      expect(lum(hovered.bg), `${name} hover is darker`).toBeLessThan(lum(rest.bg));
      // ...and the white text is still comfortably readable on it (WCAG AA is 4.5).
      expect(
        contrast(hovered.text, hovered.bg),
        `${name} hover text contrast`,
      ).toBeGreaterThanOrEqual(4.5);
      // The ring: invisible at rest everywhere; visible on hover in dark mode only.
      expect(rest.ringAlpha).toBe(0);
      if (scheme === "dark") expect(hovered.ringAlpha).toBeGreaterThan(0.3);
      else expect(hovered.ringAlpha).toBe(0);
    }
  });
}
