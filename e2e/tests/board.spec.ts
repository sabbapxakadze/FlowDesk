import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

test("dragging a card to another column moves it, and it is still there after a reload", async ({
  loggedInPage: page,
}) => {
  // Why: drag and drop is the most fragile interaction in the app (it has been
  // fixed several times). This uses a real mouse, so it exercises dnd-kit's
  // sensors, the optimistic update and the move endpoint together.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Drag me"],
  });
  await page.goto(`/projects/${projectId}/board`);

  const column = (name: string) => page.getByRole("group", { name, exact: true });
  await expect(column("Todo")).toContainText("Drag me");
  await expect(column("In progress")).not.toContainText("Drag me");

  const card = column("Todo").getByRole("listitem").filter({ hasText: "Drag me" });
  const from = (await card.boundingBox())!;
  const to = (await column("In progress").boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Several small moves: dnd-kit only starts a drag after the pointer travels a
  // few pixels, and it needs intermediate pointer events to find the target.
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, {
    steps: 5,
  });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 20 });
  await page.mouse.up();

  await expect(column("In progress")).toContainText("Drag me");
  await expect(column("Todo")).not.toContainText("Drag me");
  // Not a click: dropping must not have navigated to the issue page.
  await expect(page).toHaveURL(/\/board$/);

  // Persisted by the server, not just the optimistic UI.
  await page.reload();
  await expect(column("In progress")).toContainText("Drag me");
  await expect(column("Todo")).not.toContainText("Drag me");
});

test("dragging a card down inside its column reorders it, and the order survives a reload", async ({
  loggedInPage: page,
}) => {
  // Why: the board's drag logic moved to shared/dnd (it is also used by the sprints page). The other test
  // covers a drop into another column; this one covers the same-column path of the same code, where
  // dnd-kit's sortable decides the final index.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Alpha", "Beta", "Gamma"],
  });
  await page.goto(`/projects/${projectId}/board`);
  const todo = page.getByRole("group", { name: "Todo", exact: true });
  const order = async () => (await todo.getByRole("listitem").allInnerTexts()).map((t) => t.match(/Alpha|Beta|Gamma/)![0]);
  await expect.poll(order).toEqual(["Alpha", "Beta", "Gamma"]);

  const alpha = (await todo.getByRole("listitem").filter({ hasText: "Alpha" }).boundingBox())!;
  const gamma = (await todo.getByRole("listitem").filter({ hasText: "Gamma" }).boundingBox())!;
  await page.mouse.move(alpha.x + alpha.width / 2, alpha.y + alpha.height / 2);
  await page.mouse.down();
  await page.mouse.move(alpha.x + alpha.width / 2 + 10, alpha.y + alpha.height / 2 + 10, { steps: 5 });
  await page.mouse.move(gamma.x + gamma.width / 2, gamma.y + gamma.height - 4, { steps: 20 });
  await page.mouse.up();

  await expect.poll(order).toEqual(["Beta", "Gamma", "Alpha"]);
  await expect(page).toHaveURL(/\/board$/);
  await page.reload();
  await expect.poll(order).toEqual(["Beta", "Gamma", "Alpha"]);
});
