import { test, expect } from "../support/fixtures";

/**
 * "New label" on the Labels page: an inline row with a colour and a name at the top of the list, the same shape as Edit.
 */

const row = (page: import("@playwright/test").Page, name: string) => page.getByRole("listitem").filter({ hasText: name });

test("New label adds a label with the chosen name and colour, and the form closes", async ({ loggedInPage: page }) => {
  // Why: the feature itself. The label must exist for the organization (the API list says so), carry the colour picked, and show on the page at once.
  await page.goto("/labels");
  await page.getByRole("button", { name: "New label" }).click();
  await page.getByLabel("Label colour").fill("#ff0000");
  await page.getByRole("textbox", { name: "Label name" }).fill("Urgent bug");
  await page.getByRole("button", { name: "Add label" }).click();

  await expect(row(page, "Urgent bug")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add label" })).toHaveCount(0); // the form closed
  await expect(page.getByRole("button", { name: "New label" })).toBeVisible(); // and the button is back
  const login = await page.request.post("/api/v1/auth/login", { data: { email: "e2e-user@example.com", password: "password123" } });
  const { accessToken, organization } = await login.json();
  const list = await page.request.get(`/api/v1/organizations/${organization.id}/labels`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const labels = (await list.json()).data as { name: string; color: string }[];
  expect(labels.find((label) => label.name === "Urgent bug")?.color.toLowerCase()).toBe("#ff0000");
});

test("an empty name is refused before sending, and a name that already exists keeps the form open with the server's message", async ({ loggedInPage: page }) => {
  // Why: the two ways a create can fail. The contract's own rule (a name is required) is shown at once; a duplicate is only known to the server
  // (409), and the form must stay open so the name can be changed instead of losing what was typed.
  await page.goto("/labels");
  await page.getByRole("button", { name: "New label" }).click();
  await page.getByRole("button", { name: "Add label" }).click();
  await expect(page.getByText("Name is required")).toBeVisible();

  await page.getByRole("textbox", { name: "Label name" }).fill("Bug");
  await page.getByRole("button", { name: "Add label" }).click();
  await expect(row(page, "Bug")).toBeVisible();

  await page.getByRole("button", { name: "New label" }).click();
  await page.getByRole("textbox", { name: "Label name" }).fill("Bug");
  await page.getByRole("button", { name: "Add label" }).click();
  await expect(page.getByText("A label with this name already exists")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add label" })).toBeVisible(); // still open
});

test("Cancel closes the form without creating anything", async ({ loggedInPage: page }) => {
  // Why: a half-typed label must be easy to drop.
  await page.goto("/labels");
  await page.getByRole("button", { name: "New label" }).click();
  await page.getByRole("textbox", { name: "Label name" }).fill("Never made");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("textbox", { name: "Label name" })).toHaveCount(0);
  await expect(page.getByText("Never made")).toHaveCount(0);
});

test("a preset colour sets the label's colour, and the preview shows the name and colour as typed", async ({ loggedInPage: page }) => {
  // Why: the presets are the quick way to a consistent colour; the preview must follow both the name and the colour, so what is added is what was seen.
  await page.goto("/labels");
  await page.getByRole("button", { name: "New label" }).click();
  await page.getByRole("textbox", { name: "Label name" }).fill("Design");
  await page.getByRole("button", { name: "Use Purple" }).click();
  await expect(page.getByRole("button", { name: "Use Purple" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Use Teal" })).toHaveAttribute("aria-pressed", "false");
  const preview = page.getByText("Preview").locator("span", { hasText: "Design" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS("background-color", "rgb(147, 51, 234)"); // #9333ea
  await page.getByRole("button", { name: "Add label" }).click();

  const login = await page.request.post("/api/v1/auth/login", { data: { email: "e2e-user@example.com", password: "password123" } });
  const { accessToken, organization } = await login.json();
  const list = await page.request.get(`/api/v1/organizations/${organization.id}/labels`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const labels = (await list.json()).data as { name: string; color: string }[];
  expect(labels.find((label) => label.name === "Design")?.color.toLowerCase()).toBe("#9333ea");
});

test("a label row shows its colour code and the day it was created", async ({ loggedInPage: page }) => {
  // Why: the list is a table now (Label, Colour, Created); the hex code and a date must be real data, not placeholders.
  await page.goto("/labels");
  await page.getByRole("button", { name: "New label" }).click();
  await page.getByRole("textbox", { name: "Label name" }).fill("Docs");
  await page.getByRole("button", { name: "Use Green" }).click();
  await page.getByRole("button", { name: "Add label" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Docs" });
  await expect(row).toContainText("#15803D");
  await expect(row).toContainText(String(new Date().getFullYear()));
});
