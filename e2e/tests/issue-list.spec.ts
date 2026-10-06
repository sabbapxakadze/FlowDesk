import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import {
  createIssueViaApi,
  setIssueDueDateViaApi,
  setIssuePriorityViaApi,
} from "../support/api";

/**
 * The Issues list (ADR 0036): one surface of two-line rows under a column header, not a stack of cards. Wide: columns; narrow
 * (a phone, or the issue side panel narrowing the list): the same rows stacked, no header.
 */

const panelOf = (page: Page) => page.getByRole("dialog", { name: "Issue", exact: true });
const row = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ hasText: title });

async function setup(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Priority thing", "Late thing", "Mine thing"],
  });
  await setIssuePriorityViaApi(page.request, projectId, issueIds[0]!, "high");
  await setIssueDueDateViaApi(page.request, projectId, issueIds[1]!, "2020-01-02");
  const login = await page.request.post("/api/v1/auth/login", {
    data: { email: "e2e-user@example.com", password: "password123" },
  });
  const { accessToken, user, organization } = await login.json();
  const assigned = await page.request.patch(
    `/api/v1/organizations/${organization.id}/projects/${projectId}/issues/${issueIds[2]}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { version: 1, assigneeId: user.id },
    },
  );
  expect(assigned.status()).toBe(200);
  await page.goto("/projects/WEB");
  await expect(row(page, "Mine thing")).toBeVisible();
}

test("wide: a header names the columns, the key sits under the title, and status, priority, due and who line up under their headings", async ({
  loggedInPage: page,
}) => {
  // Why: the point of the redesign is that the eye can scan a column. If a cell drifts from its heading the table is just decoration.
  await page.setViewportSize({ width: 1400, height: 900 });
  await setup(page);

  for (const heading of ["Issue", "Status", "Priority", "Due", "Who"])
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
  const x = async (locator: ReturnType<Page["locator"]>) =>
    Math.round((await locator.boundingBox())!.x);

  const priorityRow = row(page, "Priority thing");
  const title = (await priorityRow.getByText("Priority thing").boundingBox())!;
  const key = (await priorityRow.getByText("WEB-1", { exact: true }).boundingBox())!;
  expect(key.y).toBeGreaterThan(title.y); // the key is under the title
  expect(Math.abs(key.x - title.x)).toBeLessThanOrEqual(1);

  expect(
    Math.abs(
      (await x(priorityRow.getByText("Todo").first())) -
        (await x(page.getByText("Status", { exact: true }))),
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      (await x(priorityRow.getByText("High"))) -
        (await x(page.getByText("Priority", { exact: true }))),
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      (await x(row(page, "Late thing").getByText(/Overdue/))) -
        (await x(page.getByText("Due", { exact: true }))),
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      (await x(row(page, "Mine thing").locator('a[href^="/people/"]').first())) -
        (await x(page.getByText("Who", { exact: true }))),
    ),
  ).toBeLessThanOrEqual(4);
});

test("Edit stays out of sight until you point at the row or tab into it, and works from the keyboard", async ({
  loggedInPage: page,
}) => {
  // Why: a column of Edit buttons is noise, but hiding it must never make it unreachable for keyboard users.
  await page.setViewportSize({ width: 1400, height: 900 });
  await setup(page);
  const edit = row(page, "Priority thing").getByRole("button", { name: "Edit" });
  await page.mouse.move(2, 2);
  await expect(edit).toHaveCSS("opacity", "0");
  await row(page, "Priority thing").hover();
  await expect(edit).toHaveCSS("opacity", "1");
  await page.mouse.move(2, 2);
  await expect(edit).toHaveCSS("opacity", "0");
  await edit.focus(); // tabbing in: focus alone reveals it
  await expect(edit).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Edit WEB-1" })).toBeVisible();
});

test("narrow (a phone): no header, status and priority sit under the title, and the page does not scroll sideways", async ({
  loggedInPage: page,
}) => {
  // Why: the table is for room. On a phone the same rows must stack, not squeeze six columns into 400 pixels.
  await page.setViewportSize({ width: 420, height: 800 });
  await setup(page);
  await expect(page.getByText("Priority", { exact: true })).toBeHidden(); // the header strip is gone
  const priorityRow = row(page, "Priority thing");
  const title = (await priorityRow.getByText("Priority thing").boundingBox())!;
  const high = (await priorityRow.getByText("High").boundingBox())!;
  expect(high.y).toBeGreaterThan(title.y + title.height - 1); // under the title, not beside it
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("with the issue panel open on a 1280px window, nothing in a row sits under the panel", async ({
  loggedInPage: page,
}) => {
  // Why: the floating panel covers the right 500px. The list used to run under it; now the list steps aside and stacks.
  await page.setViewportSize({ width: 1280, height: 800 });
  await setup(page);
  await page.getByRole("link", { name: /Mine thing/ }).click();
  await expect(panelOf(page)).toBeVisible();
  const panel = (await panelOf(page).boundingBox())!;
  const mine = row(page, "Mine thing");
  for (const part of [
    mine.getByRole("button", { name: "Edit" }),
    mine.locator('a[href^="/people/"]').first(),
    mine.getByText("Todo").first(),
  ]) {
    const box = (await part.boundingBox())!;
    expect(box.x + box.width, "a row cell is under the open panel").toBeLessThanOrEqual(
      panel.x + 1,
    );
  }
});
