import { test, expect, TEST_USER } from "../support/fixtures";

/**
 * The public auth pages (ADR 0041): a frosted-glass card over soft shapes, a Log in / Create account switch on login and register,
 * and a show / hide button in every password field.
 */

test("the switch moves between Log in and Create account and marks the current one", async ({
  page,
}) => {
  // Why: it is the new way between the two pages. A wrong "current" marker, or a link to the wrong address, would mislead everyone.
  await page.goto("/login");
  const nav = page.getByRole("navigation", { name: "Account" });
  await expect(nav.getByRole("link", { name: "Log in" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Create account" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  await nav.getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Create your account" }),
  ).toBeVisible();
  await expect(nav.getByRole("link", { name: "Create account" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Log in" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  await nav.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
});

test("the other public pages have the card but no switch", async ({ page }) => {
  // Why: the switch only makes sense between login and register; forgot-password and the rest must not show it.
  await page.goto("/forgot-password");
  await expect(page.getByRole("navigation", { name: "Account" })).toHaveCount(0);
  await expect(page.locator(".glass-card")).toHaveCount(1);
});

test("show / hide password: hidden at first, revealed on request, never submits, and Enter still logs in", async ({
  page,
}) => {
  // Why: a reveal button that submitted the form, lost the caret, or left the password showing on the next visit would be worse than none.
  const registered = await page.request.post("/api/v1/auth/register", {
    data: TEST_USER,
  });
  expect(registered.status()).toBe(201);
  await page.goto("/login");
  const field = page.getByLabel("Password", { exact: true });
  await expect(field).toHaveAttribute("type", "password");

  await page.getByLabel("Email").fill(TEST_USER.email);
  await field.fill("typed-secret");
  const toggle = page.getByRole("button", { name: "Show password" });
  await toggle.click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveValue("typed-secret");
  await expect(field).toBeFocused(); // pressing the button did not take focus out of the field
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page).toHaveURL(/\/login$/); // and nothing was submitted

  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(field).toHaveAttribute("type", "password");

  await field.fill(TEST_USER.password);
  await field.press("Enter");
  await expect(page).toHaveURL(/\/$/);
});

test("the field is named by its label only, and a revisit starts hidden again", async ({
  page,
}) => {
  // Why: the button sits inside the label, so without the explicit naming the field would be announced as "Password Show password".
  await page.goto("/register");
  const field = page.getByLabel("Password", { exact: true });
  await expect(field).toHaveAccessibleName("Password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(field).toHaveAttribute("type", "text");
  await page.goto("/login");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
});

test("each of the three password fields on the account page has its own working button", async ({
  loggedInPage: page,
}) => {
  // Why: the same component replaced every password input; one form that kept a plain input, or whose buttons shared state, would be a gap.
  await page.goto("/account");
  const section = page.locator("form", { has: page.getByLabel("Current password") });
  const buttons = section.getByRole("button", { name: "Show password" });
  await expect(buttons).toHaveCount(3);
  await buttons.first().click();
  await expect(section.getByLabel("Current password")).toHaveAttribute("type", "text");
  await expect(section.getByLabel("New password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  ); // the others did not move with it
  await expect(section.getByLabel("Current password")).toHaveAccessibleName(
    "Current password",
  );
});

test("the card is frosted glass over three decorative shapes", async ({ page }) => {
  // Why: the look is the point of the change; the shapes must be pure decoration (hidden from assistive tech) and the blur real.
  await page.goto("/login");
  const card = page.locator(".glass-card");
  const blur = await card.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(blur).toContain("blur");
  const shapes = page.locator('div[aria-hidden="true"] div.rounded-full');
  await expect(shapes).toHaveCount(3);
});

test("on a phone neither page scrolls sideways", async ({ page }) => {
  // Why: the blurred shapes are larger than the screen; the page must clip them rather than grow wider.
  await page.setViewportSize({ width: 390, height: 800 });
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(page.locator(".glass-card")).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(fits, `${path} scrolls sideways`).toBe(true);
  }
});

test("the theme switch on the public pages changes the theme and is remembered after a reload", async ({ page }) => {
  // Why: people can pick Light or Dark before logging in. The choice must really change the page (data-theme on <html>),
  // be marked as pressed for assistive technology, and survive a reload (it is stored in the browser).
  await page.goto("/login");
  const theme = page.getByRole("group", { name: "Theme" });
  await theme.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(theme.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/register"); // the other public pages have it too
  await theme.getByRole("button", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
