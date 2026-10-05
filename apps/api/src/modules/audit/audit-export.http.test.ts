import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";
import { csvCell, toCsv } from "../../shared/csv.js";
import { buildAuditCsv } from "./audit.controller.js";
import * as auditRepository from "./audit.repository.js";

/**
 * The audit log's CSV export, over real HTTP and the real database. Each test says what it protects.
 */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string; userId: string };

async function registerAndLogIn(email: string, organizationName: string, name = "Owner Person"): Promise<Session> {
  await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name, organizationName }).expect(201);
  return logIn(email);
}
async function logIn(email: string): Promise<Session> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return { token: res.body.accessToken, organizationId: res.body.organization.id, userId: res.body.user.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const org = (s: Session) => `/api/v1/organizations/${s.organizationId}`;

async function addPerson(owner: Session, email: string, role: "admin" | "member", name: string) {
  const invited = await request(app).post(`${org(owner)}/invitations`).set(as(owner)).send({ email, role }).expect(201);
  const token = new URL(invited.body.inviteUrl).searchParams.get("token")!;
  await request(app).post("/api/v1/invitations/accept").send({ token, name, password: PASSWORD }).expect(201);
  return logIn(email);
}
async function makeProject(s: Session, name: string, key: string) {
  const res = await request(app).post(`${org(s)}/projects`).set(as(s)).send({ name, key }).expect(201);
  return res.body.data.id as string;
}
const exportCsv = (s: Session, query = "") => request(app).get(`${org(s)}/audit-events/export${query}`).set(as(s));
/** The body as lines, the byte order mark removed. */
const linesOf = (text: string) => text.replace(/^\uFEFF/, "").split("\r\n").filter((line) => line !== "");

describe("audit log export", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("an owner gets a CSV file: header first, then the rows newest first, with raw fields", async () => {
    // Why: the feature itself. Raw fields (action name, target, details as JSON), not the web page's sentence.
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const projectId = await makeProject(owner, "Website", "WEB");
    await request(app).patch(`${org(owner)}/projects/${projectId}`).set(as(owner)).send({ name: "Marketing site" }).expect(200);

    const res = await exportCsv(owner).expect(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.text.startsWith("\uFEFF")).toBe(true); // so Excel reads UTF-8
    const lines = linesOf(res.text);
    expect(lines[0]).toBe("time,who,action,target_type,target,details");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z,Olivia Owner,project\.renamed,project,Marketing site,/); // newest first
    expect(lines[2]).toMatch(/,project\.created,project,Website,/);
    expect(lines[1]).toContain('""from"":""Website""'); // details are JSON, quoted for CSV
  });

  it("a plain member and a signed-out request are refused", async () => {
    // Why: the log is for owners and admins; the export must not be a way around that.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const member = await addPerson(owner, "member@example.com", "member", "Mia Member");
    await exportCsv(member).expect(403);
    await request(app).get(`${org(owner)}/audit-events/export`).expect(401);
  });

  it("another organization's events never appear", async () => {
    // Why: tenant scoping (every query takes the organization id).
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    await makeProject(a, "Public plans", "PUB");
    await makeProject(b, "Secret plans", "SEC");
    const text = (await exportCsv(a).expect(200)).text;
    expect(text).toContain("Public plans");
    expect(text).not.toContain("Secret plans");
    // And an owner cannot export another organization's log by putting its id in the address.
    await request(app).get(`${org(b)}/audit-events/export`).set(as(a)).expect(403);
  });

  it("the person and kind filters apply, and a bad filter is a 400", async () => {
    // Why: the file must match what the page shows with the same filters.
    const owner = await registerAndLogIn("owner@example.com", "Org A", "Olivia Owner");
    const admin = await addPerson(owner, "admin@example.com", "admin", "Adam Admin");
    await makeProject(owner, "Owner project", "OWN");
    await makeProject(admin, "Admin project", "ADM");

    const byAdmin = linesOf((await exportCsv(owner, `?actor=${admin.userId}`).expect(200)).text);
    expect(byAdmin.slice(1).every((line) => line.includes("Adam Admin"))).toBe(true);
    expect(byAdmin.join("\n")).toContain("Admin project");
    expect(byAdmin.join("\n")).not.toContain("Owner project");

    const members = linesOf((await exportCsv(owner, "?kind=member").expect(200)).text);
    expect(members.join("\n")).not.toContain("project.created"); // only member rows (the invitation)
    expect(members.length).toBeGreaterThan(1);

    await exportCsv(owner, "?kind=nonsense").expect(400);
    await exportCsv(owner, "?actor=not-a-uuid").expect(400);
  });

  it("names that look like spreadsheet formulas are neutralised, and commas and quotes are quoted", async () => {
    // Why: names are typed by people and the file is opened in a spreadsheet, which would run =HYPERLINK(...).
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await makeProject(owner, '=HYPERLINK("http://x","y")', "EVIL");
    const text = (await exportCsv(owner).expect(200)).text;
    expect(text).toContain(`"'=HYPERLINK(""http://x"",""y"")"`); // apostrophe in front, whole cell quoted, quotes doubled
    expect(text).not.toMatch(/,=HYPERLINK/); // no cell starts with the formula
  });
});

describe("csv helpers and the row cap", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("csvCell quotes what needs it and prefixes formula starters; toCsv adds the BOM and CRLF", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    for (const start of ["=1+1", "+1", "-1", "@cmd", "\tx"]) expect(csvCell(start)).toBe(`'${start}`);
    expect(csvCell("")).toBe("");
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("\uFEFFa,b\r\nc,d\r\n");
  });

  it("an export past the cap says so on its last line, and the repository tells exactly-at-the-cap from over it", async () => {
    // Why: a silently cut file would look complete. (The cap itself is 10,000 rows; the repository takes it as a
    // parameter so this test does not need 10,000 rows.)
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    for (const [name, key] of [["One", "ONE"], ["Two", "TWO"], ["Three", "THR"]] as const) await makeProject(owner, name, key);

    const over = await auditRepository.listForExport(owner.organizationId, {}, 2);
    expect(over.items).toHaveLength(2);
    expect(over.truncated).toBe(true);
    const exact = await auditRepository.listForExport(owner.organizationId, {}, 3);
    expect(exact.items).toHaveLength(3);
    expect(exact.truncated).toBe(false);

    const rows = over.items.map((r) => ({ ...r, details: r.details }));
    const cut = linesOf(buildAuditCsv(rows, true));
    expect(cut[cut.length - 1]).toMatch(/^Only the newest 10000 rows are included/);
    const whole = linesOf(buildAuditCsv(rows, false));
    expect(whole[whole.length - 1]).not.toMatch(/Only the newest/);
  });
});
