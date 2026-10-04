import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

async function sprintsInEveryState(page: Page) {
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: [],
  });
  const { headers, base } = await apiSession(page.request);
  const sprints = `${base}/projects/${projectId}/sprints`;
  const make = async (name: string) => {
    const res = await page.request.post(sprints, { headers, data: { name } });
    expect(res.status()).toBe(201);
    return (await res.json()).data as { id: string; version: number };
  };
  const move = async (s: { id: string; version: number }, action: "start" | "complete") => {
    const res = await page.request.patch(`${sprints}/${s.id}/${action}`, { headers, data: { version: s.version } });
    expect(res.status()).toBe(200);
    return (await res.json()).data as { id: string; version: number };
  };
  const done = await make("Done sprint");
  await move(await move(done, "start"), "complete");
  await move(await make("Active sprint"), "start");
  await make("Planned sprint");
  return { projectId };
}

test("Rename sits in the same place on a completed, an active and a planned sprint, and Delete only where allowed", async ({
  loggedInPage: page,
}) => {
  // Why: the buttons used to be spread by space-between, so a row without a Delete button (the
  // active one) put Rename somewhere else. Three fixed slots keep every row the same.
  const { projectId } = await sprintsInEveryState(page);
  await page.goto(`/projects/${projectId}/sprints`);
  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name }).filter({ has: page.getByTestId("sprint-actions") });
  await expect(row("Done sprint")).toBeVisible();

  const fromRight = async (name: string, button: string) => {
    const li = (await row(name).boundingBox())!;
    const b = (await row(name).getByRole("button", { name: button }).boundingBox())!;
    return Math.round(li.x + li.width - (b.x + b.width));
  };
  const rename = [await fromRight("Done sprint", "Rename Done sprint"), await fromRight("Active sprint", "Rename Active sprint"), await fromRight("Planned sprint", "Rename Planned sprint")];
  expect(new Set(rename).size).toBe(1);

  // The middle slot: Complete on the active row and Start on the planned row take the same place.
  expect(await fromRight("Active sprint", "Complete")).toBe(await fromRight("Planned sprint", "Start"));
  // Delete is at the far right, on the completed and planned rows, and absent on the active one.
  expect(await fromRight("Done sprint", "Delete")).toBe(await fromRight("Planned sprint", "Delete"));
  await expect(row("Active sprint").getByRole("button", { name: "Delete" })).toHaveCount(0);
});
