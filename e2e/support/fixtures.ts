import { test as base, expect, type Page } from "@playwright/test";
import { resetDatabase } from "./db";

export const TEST_USER = {
  name: "E2E User",
  email: "e2e-user@example.com",
  password: "password123",
  organizationName: "E2E Org",
};

/** Registers through the real API (fast), without touching the browser. */
async function registerUser(page: Page) {
  const res = await page.request.post("/api/v1/auth/register", { data: TEST_USER });
  expect(res.status(), "register should succeed").toBe(201);
}

/** Logs in through the real login form, the same way a person does. A login lands on My work (`/`). */
export async function logInThroughForm(page: Page, email: string = TEST_USER.email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

type Fixtures = {
  /** A page with the test user registered and logged in, then taken to /projects (most tests start there). */
  loggedInPage: Page;
  /** Auto fixture: empties the database before each test. */
  resetDb: void;
};

export const test = base.extend<Fixtures>({
  // Runs before every test (auto: true): an empty database, so no test can
  // depend on, or be broken by, what another test left behind.
  resetDb: [
    // Playwright requires fixtures to destructure their first argument, even when empty.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await resetDatabase();
      await use();
    },
    { auto: true },
  ],
  loggedInPage: async ({ page }, use) => {
    await registerUser(page);
    await logInThroughForm(page);
    // The real landing page is My work; the tests that use this fixture started on the project list, so go there.
    await page.goto("/projects");
    await use(page);
  },
});

export { expect };
