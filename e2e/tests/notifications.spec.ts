import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

test("a comment from someone else shows an unread count; Mark all read is a link-styled button and clears it", async ({
  loggedInPage: owner,
  browser,
}) => {
  // Why: "Mark all read" was converted to the shared link-style button in the Button cleanup
  // and had no test at all. A second real user comments, so a real notification arrives live.
  const { projectId, issueIds } = await createIssueViaApi(owner.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Needs attention"],
  });
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  // The owner has to be a participant to be notified: comment once so the later comment reaches them.
  await owner.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await owner.getByRole("textbox", { name: "Comment", exact: true }).fill("First, from the owner");
  await owner.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(owner.getByText("First, from the owner")).toBeVisible();

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await logInThroughForm(other, "e2e-second@example.com");
  await other.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await other.getByRole("textbox", { name: "Comment", exact: true }).fill("Hello from Second");
  await other.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(other.getByText("Hello from Second")).toBeVisible();

  const bell = owner.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toContainText("1");
  await bell.click();
  const markAll = owner.getByRole("button", { name: "Mark all read" });
  await expect(markAll).toBeVisible();

  // The shared link look: link colour, underlined, no padding.
  const style = await markAll.evaluate((el) => {
    const c = getComputedStyle(el);
    const probe = document.createElement("span");
    probe.style.color = "var(--color-text-link)";
    document.body.appendChild(probe);
    const link = getComputedStyle(probe).color;
    probe.remove();
    return { color: c.color, link, underline: c.textDecorationLine, padding: c.padding };
  });
  expect(style.color).toBe(style.link);
  expect(style.underline).toBe("underline");
  expect(style.padding).toBe("0px");

  await markAll.click();
  await expect(markAll).toHaveCount(0); // nothing unread any more
  await expect(bell).not.toContainText("1");
  await ctx.close();
});

test("the open notifications dropdown stays above page content that is positioned later in the page", async ({
  loggedInPage: page,
}) => {
  // Why: found by the owner on the analytics page. The sidebar is `sticky`, which makes its own
  // stacking context; without a z-index it painted BELOW later positioned content (the Recharts
  // charts), so charts covered the dropdown. A positioned probe laid over the whole window
  // inside <main> stands in for a chart, so the test does not depend on chart data.
  await page.goto("/projects");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const dropdown = page.getByText("Notifications", { exact: true }).locator("xpath=ancestor::div[contains(@class,'absolute')][1]");
  await expect(dropdown).toBeVisible();

  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "stacking-probe";
    probe.style.cssText = "position:fixed;inset:0;background:rgba(255,0,0,0.2);";
    document.querySelector("main")!.appendChild(probe);
  });

  const box = (await dropdown.boundingBox())!;
  const coveredByProbe = await page.evaluate(
    ({ x, y, width, height }) => {
      let covered = 0;
      for (let i = 1; i < 10; i++)
        for (let j = 1; j < 10; j++) {
          const el = document.elementFromPoint(x + (width * i) / 10, y + (height * j) / 10);
          if (el?.id === "stacking-probe") covered++;
        }
      return covered;
    },
    box,
  );
  expect(coveredByProbe).toBe(0);
});
