import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi, setIssuePriorityViaApi } from "../support/api";

/**
 * The board card's look (ADR 0037): a colored edge for the priority, the key and assignee on the first line, the labels and the
 * priority in a footer. Only the look: dragging and moving are covered by board.spec, backlog-order.spec and drag-performance.spec.
 */

const card = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ hasText: title });
const edge = (page: Page, title: string) =>
  card(page, title).locator("[data-priority-edge]");

async function setup(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Urgent card", "High card", "Low card", "Plain card"],
  });
  await setIssuePriorityViaApi(page.request, projectId, issueIds[0]!, "urgent");
  await setIssuePriorityViaApi(page.request, projectId, issueIds[1]!, "high");
  await setIssuePriorityViaApi(page.request, projectId, issueIds[2]!, "low");

  const { headers, base } = await apiSession(page.request);
  const label = await page.request.post(`${base}/labels`, {
    headers,
    data: { name: "bug", color: "#b91c1c" },
  });
  const labelId = (await label.json()).data.id as string;
  const attached = await page.request.post(
    `${base}/projects/${projectId}/issues/${issueIds[0]}/labels`,
    { headers, data: { labelId } },
  );
  expect(attached.status()).toBe(201);

  // Assign the urgent card to the signed-in user (its version is 2 after the priority change).
  const login = await page.request.post("/api/v1/auth/login", {
    data: { email: "e2e-user@example.com", password: "password123" },
  });
  const { accessToken, user, organization } = await login.json();
  const assigned = await page.request.patch(
    `/api/v1/organizations/${organization.id}/projects/${projectId}/issues/${issueIds[0]}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { version: 2, assigneeId: user.id },
    },
  );
  expect(assigned.status()).toBe(200);
}

for (const where of ["board", "sprints"] as const) {
  test(`${where}: a card's left edge shows its priority in its own color, and a card without priority has none`, async ({
    loggedInPage: page,
  }) => {
    // Why: the edge is the point of the redesign (priority at a glance). It must differ per priority and be absent for none.
    await setup(page);
    await page.goto(`/projects/WEB/${where}`);
    await expect(card(page, "Plain card")).toBeVisible();

    const color = async (title: string) =>
      edge(page, title).evaluate((el) => getComputedStyle(el).backgroundColor);
    const urgent = await color("Urgent card");
    const high = await color("High card");
    const low = await color("Low card");
    expect(new Set([urgent, high, low]).size).toBe(3); // three different priorities, three different colors
    await expect(edge(page, "Plain card")).toHaveCount(0);
  });
}

test("the grip is out of sight until you point at the card or tab into it", async ({
  loggedInPage: page,
}) => {
  // Why: the grip is a hint and the keyboard handle. Hiding it must never make the keyboard drag unreachable.
  await setup(page);
  await page.goto("/projects/WEB/board");
  const grip = card(page, "Plain card").getByRole("button", {
    name: "Drag to reorder or move",
  });
  await page.mouse.move(2, 2);
  await expect(grip).toHaveCSS("opacity", "0");
  await card(page, "Plain card").hover();
  await expect(grip).toHaveCSS("opacity", "1");
  await page.mouse.move(2, 2);
  await expect(grip).toHaveCSS("opacity", "0");
  await grip.focus();
  await expect(grip).toHaveCSS("opacity", "1");
});
