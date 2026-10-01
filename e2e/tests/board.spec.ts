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

  const column = (name: string) => page.locator("h2", { hasText: name }).locator("..");
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
