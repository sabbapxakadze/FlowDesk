import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

/** An issue with a "created" line and an "assigned to Second Person" line, opened. */
async function openIssueWithAssignment(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Pass the baton"],
  });
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });
  await page.goto(`/projects/${projectId}`);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Pass the baton" })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.locator(`select[name="assigneeId"]`).selectOption({ label: "Second Person" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("img", { name: "Assigned to Second Person" }),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  const assignLine = page.getByRole("listitem").filter({ hasText: "assigned this issue to" });
  await expect(assignLine).toBeVisible();
  return { assignLine, createdLine: page.getByRole("listitem").filter({ hasText: "created this issue" }) };
}

const visibleCard = (page: Page) => page.locator('[role="tooltip"]:visible');

test("an activity line has an icon circle, the sentence and the time at the right edge", async ({
  loggedInPage: page,
}) => {
  // Why: the layout is the point. The time must sit right of the sentence, and the
  // icon circle must be a real 28px circle before it.
  const { assignLine } = await openIssueWithAssignment(page);
  // innerText is what a person sees: the hidden hover cards inside the line are not in it.
  await expect
    .poll(() => assignLine.evaluate((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ")))
    .toContain("E2E User assigned this issue to Second Person");

  const circle = assignLine.locator("span.rounded-full").first();
  const box = (await circle.boundingBox())!;
  expect(Math.round(box.width)).toBe(28);
  expect(Math.round(box.height)).toBe(28);

  const sentence = (await assignLine.getByRole("link", { name: "E2E User" }).boundingBox())!;
  const time = (await assignLine.locator("time").boundingBox())!;
  expect(time.x).toBeGreaterThan(sentence.x + sentence.width);
  const line = (await assignLine.boundingBox())!;
  expect(Math.round(time.x + time.width)).toBeGreaterThanOrEqual(Math.round(line.x + line.width) - 1);
});

test("the icon colour follows what happened: green for created, accent for assigned", async ({
  loggedInPage: page,
}) => {
  // Why: colour is the meaning. Expected colours are resolved from the real tokens
  // (a probe element), not typed in, so a token change cannot silently diverge.
  const { assignLine, createdLine } = await openIssueWithAssignment(page);
  const resolve = (token: string) =>
    page.evaluate((t) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${t})`;
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }, token);
  const iconColor = (line: ReturnType<Page["locator"]>) =>
    line.locator("span.rounded-full").first().evaluate((el) => getComputedStyle(el).color);

  expect(await iconColor(createdLine)).toBe(await resolve("--color-event-added"));
  expect(await iconColor(assignLine)).toBe(await resolve("--color-event-changed"));
  expect(await resolve("--color-event-added")).not.toBe(await resolve("--color-event-changed"));
});

test("hovering the actor, or the person who was assigned, opens that person's card", async ({
  loggedInPage: page,
}, testInfo) => {
  // Why: the owner asked for the hover on anyone mentioned, not only the actor. Each
  // card must show that person's own name, role and email from the member list.
  const { assignLine } = await openIssueWithAssignment(page);
  await expect(visibleCard(page)).toHaveCount(0);

  await assignLine.getByRole("link", { name: "E2E User" }).hover();
  await expect(visibleCard(page)).toHaveCount(1);
  await expect(visibleCard(page)).toContainText("E2E User");
  await expect(visibleCard(page)).toContainText("Owner");
  await expect(visibleCard(page)).toContainText("e2e-user@example.com");

  await page.mouse.move(5, 5);
  await expect(visibleCard(page)).toHaveCount(0);

  await assignLine.getByRole("link", { name: "Second Person" }).hover();
  await expect(visibleCard(page)).toHaveCount(1);
  await expect(visibleCard(page)).toContainText("Second Person");
  await expect(visibleCard(page)).toContainText("Member");
  await expect(visibleCard(page)).toContainText("e2e-second@example.com");
  await expect(visibleCard(page)).not.toContainText("e2e-user@example.com");
  await page.waitForTimeout(700); // let the delay and fade finish for the picture
  await page.screenshot({ path: testInfo.outputPath("hover-assignee.png") });
});

test("the card also opens from the keyboard and is described to assistive tech", async ({
  loggedInPage: page,
}) => {
  // Why: hover alone would exclude keyboard users. Focus must open the card, and the
  // button must point at it with aria-describedby.
  const { assignLine } = await openIssueWithAssignment(page);
  // .first(): the card also holds a link with the same name, and it is visible once open.
  const name = assignLine.getByRole("link", { name: "Second Person" }).first();
  await name.focus();
  await expect(visibleCard(page)).toHaveCount(1);
  await expect(visibleCard(page)).toContainText("e2e-second@example.com");
  const describedBy = await name.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText("Second Person");

  await assignLine.getByRole("link", { name: "E2E User" }).first().focus();
  await expect(visibleCard(page)).toHaveCount(1);
  await expect(visibleCard(page)).toContainText("E2E User");
});

test("on a phone-sized screen nothing scrolls sideways and the card stays inside the window", async ({
  loggedInPage: page,
}) => {
  const { assignLine } = await openIssueWithAssignment(page);
  await page.setViewportSize({ width: 400, height: 760 });
  await assignLine.getByRole("link", { name: "Second Person" }).hover();
  await expect(visibleCard(page)).toHaveCount(1);
  const card = (await visibleCard(page).boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(400);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
