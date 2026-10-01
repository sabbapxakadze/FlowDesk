import { test, expect, TEST_USER, logInThroughForm } from "../support/fixtures";

test.describe("auth", () => {
  test("registers through the form, then logs in and sees the projects page", async ({
    page,
  }) => {
    // Why: the whole front door in one pass, through the real forms and the real API.
    await page.goto("/register");
    await page.getByLabel("Name", { exact: true }).fill(TEST_USER.name);
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByLabel("Organization name").fill(TEST_USER.organizationName);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Account created for")).toBeVisible();

    await logInThroughForm(page);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });

  test("a wrong password shows an error and stays on the login page", async ({
    page,
  }) => {
    // Why: proves the failure path shows something instead of silently doing nothing.
    await page.request.post("/api/v1/auth/register", { data: TEST_USER });
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("alert").or(page.getByText(/invalid|incorrect|wrong/i)),
    ).toBeVisible();
  });

  test("stays logged in after a full page reload", async ({ loggedInPage: page }) => {
    // Why: the session is an in-memory access token plus a refresh cookie, so a
    // reload only works if the refresh round trip works. Earlier, a reload in a
    // manually driven browser sent the user back to login (cause not found).
    await page.reload();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });
});
