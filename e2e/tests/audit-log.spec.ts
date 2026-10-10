import { test, expect, logInThroughForm } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";
import { combobox, expectValue, pick } from "../support/dropdown";

const rows = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Audit log" }).getByRole("listitem");

test("the log lists what happened, newest first, in plain sentences, and keeps deleted things by name", async ({
  loggedInPage: page,
}) => {
  // Why: the feature end to end. Actions are done through the real API (the same routes the UI
  // uses); the page must turn the stored rows into readable sentences, newest first, and still
  // describe a project and an issue that no longer exist.
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Doomed issue", "Survivor"],
  });
  const { headers, base } = await apiSession(page.request);
  const projectUrl = `${base}/projects/${projectId}`;
  expect((await page.request.patch(projectUrl, { headers, data: { name: "Marketing site" } })).status()).toBe(200);
  expect((await page.request.delete(`${projectUrl}/issues/${issueIds[0]}`, { headers })).status()).toBe(204);
  expect(
    (await page.request.delete(projectUrl, { headers, data: { confirmName: "Marketing site" } })).status(),
  ).toBe(204);

  await page.goto("/audit-log");
  await expect(rows(page)).toHaveCount(4);
  // Newest first.
  await expect(rows(page).nth(0)).toContainText('E2E User deleted the project "Marketing site" and its 1 issue', { useInnerText: true });
  await expect(rows(page).nth(1)).toContainText("E2E User deleted the issue WEB-1 Doomed issue in Marketing site", { useInnerText: true });
  await expect(rows(page).nth(2)).toContainText('E2E User renamed the project "Website" to "Marketing site"', { useInnerText: true });
  await expect(rows(page).nth(3)).toContainText('E2E User created the project "Website"', { useInnerText: true });
  // Each row carries a time (with the exact moment on hover).
  await expect(rows(page).nth(0).locator("time")).toHaveCount(1);
});

test("filter by kind and by person; the choice is in the URL and survives a reload", async ({
  loggedInPage: page,
}) => {
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["One"] });
  const { headers, base } = await apiSession(page.request);
  // A member-related row by the owner, and a project row by the second person.
  await page.request.post(`${base}/invitations`, { headers, data: { email: "new@example.com", role: "member" } });

  const second = await page.context().browser()!.newContext();
  const secondPage = await second.newPage();
  await logInThroughForm(secondPage, "e2e-second@example.com");

  await page.goto("/audit-log");
  await expect(rows(page)).toHaveCount(2); // project created, invited
  await pick(combobox(page, "Filter by kind"), "Members");
  await expect(page).toHaveURL(/kind=member/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("invited new@example.com to join as member", { useInnerText: true });

  await page.reload();
  await expectValue(combobox(page, "Filter by kind"), "member");
  await expect(rows(page)).toHaveCount(1);

  await pick(combobox(page, "Filter by kind"), "Everything");
  await pick(combobox(page, "Filter by person"), "Second Person");
  await expect(page).toHaveURL(/actor=/);
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible(); // they did nothing yet
  await second.close();
});

test("Load more continues the log with nothing repeated", async ({ loggedInPage: page }) => {
  // Why: more than one page (25 rows) through the real UI.
  await createIssueViaApi(page.request, { projectName: "First", projectKey: "AAA", titles: [] });
  const { headers, base } = await apiSession(page.request);
  for (let i = 0; i < 29; i++) {
    const res = await page.request.post(`${base}/projects`, { headers, data: { name: `Project ${i}`, key: `P${String(i).padStart(2, "0")}X` } });
    expect(res.status()).toBe(201);
  }
  await page.goto("/audit-log");
  await expect(rows(page)).toHaveCount(25);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(rows(page)).toHaveCount(30);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  const texts = await rows(page).allInnerTexts();
  expect(new Set(texts.map((t) => t.split("\n")[0])).size).toBe(30); // all different sentences
});

test("members never see the log: no sidebar link, and the page explains instead of listing", async ({
  loggedInPage: page,
}) => {
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  await createIssueViaApi(page.request, { projectName: "Secret", projectKey: "SEC", titles: [] });

  // The owner has the link and it works.
  await page.goto("/projects");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Audit log" }).click();
  await expect(page).toHaveURL(/\/audit-log$/);
  await expect(rows(page).first()).toContainText('created the project "Secret"', { useInnerText: true });

  // A plain member does not.
  const ctx = await page.context().browser()!.newContext();
  const member = await ctx.newPage();
  await logInThroughForm(member, "e2e-second@example.com");
  await expect(member.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Members" })).toBeVisible();
  await expect(member.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Audit log" })).toHaveCount(0);
  await member.goto("/audit-log");
  await expect(member.getByText("Only owners and admins can see the audit log.")).toBeVisible();
  // The project's NAME is visible to every member in the sidebar; what they must not see is the log.
  await expect(member.getByText('created the project "Secret"')).toHaveCount(0);
  await expect(member.getByRole("list", { name: "Audit log" })).toHaveCount(0);
  await ctx.close();
});

test("Export CSV downloads the rows that match the filters, as a spreadsheet file", async ({ loggedInPage: page }) => {
  // Why: the feature end to end in the real UI: the button, the authenticated download (the token is a header, so a plain
  // link would not work), the file name, and that the chosen filter changes what is in the file.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: [] });
  const { headers, base } = await apiSession(page.request);
  await page.request.post(`${base}/invitations`, { headers, data: { email: "new@example.com", role: "member" } });
  await page.goto("/audit-log");
  await expect(rows(page)).toHaveCount(2);

  const readDownload = async () => {
    const download = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]).then(
      ([d]) => d,
    );
    expect(download.suggestedFilename()).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
    const { readFile } = await import("node:fs/promises");
    return (await readFile((await download.path())!, "utf8")).replace(/^\uFEFF/, "").split("\r\n").filter((l) => l !== "");
  };

  const everything = await readDownload();
  expect(everything[0]).toBe("time,who,action,target_type,target,details");
  expect(everything).toHaveLength(3);
  expect(everything.join("\n")).toContain("project.created");
  expect(everything.join("\n")).toContain("member.invited");

  await pick(combobox(page, "Filter by kind"), "Members");
  await expect(rows(page)).toHaveCount(1);
  const members = await readDownload();
  expect(members).toHaveLength(2); // the header and the one member row
  expect(members.join("\n")).toContain("member.invited");
  expect(members.join("\n")).not.toContain("project.created");
});

test("a plain member has no Export button (the page only explains)", async ({ loggedInPage: page }) => {
  // Why: the export is for the people who can read the log; the server refuses anyone else too (API tests).
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  const second = await page.context().browser()!.newContext();
  const secondPage = await second.newPage();
  await logInThroughForm(secondPage, "e2e-second@example.com");
  await secondPage.goto("/audit-log");
  await expect(secondPage.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await second.close();
});
