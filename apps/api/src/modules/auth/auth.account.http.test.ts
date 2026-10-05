import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { authTokens, users } from "../../db/schema/index.js";
import * as authRepository from "./auth.repository.js";
import { generateOpaqueToken, hashToken } from "./tokens.js";

/**
 * The private account page's API: password, email (confirmed through a link to the new address) and timezone. Over real
 * HTTP and the real database. The raw email-change token only ever exists in the email, so (like the recovery tests) the
 * confirm step is driven with a token this test creates through the same repository function.
 */

const PASSWORD = "password123";
type Session = { token: string; cookie: string; userId: string; organizationId: string };

async function register(email: string, name = "Account Person") {
  await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name, organizationName: `${name} Org` }).expect(201);
}
async function logIn(email: string, password = PASSWORD): Promise<Session> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password }).expect(200);
  const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  return { token: res.body.accessToken, cookie, userId: res.body.user.id, organizationId: res.body.organization.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const refresh = (s: Session) => request(app).post("/api/v1/auth/refresh").set("Cookie", s.cookie);
const change = (s: Session, body: object, withCookie = true) => {
  const req = request(app).post("/api/v1/auth/change-password").set(as(s));
  return (withCookie ? req.set("Cookie", s.cookie) : req).send(body);
};
const issueEmailChangeToken = async (userId: string, newEmail: string, expiresInMs = 60_000) => {
  const raw = generateOpaqueToken();
  await authRepository.createAuthToken({ userId, purpose: "email_change", tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + expiresInMs), newEmail });
  return raw;
};
const account = (s: Session) => request(app).get("/api/v1/users/me/account").set(as(s));

describe("account: timezone", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("starts on the browser's timezone, can be set to a real zone and put back, and a made-up one is refused", async () => {
    // Why: null means "use the browser's"; only real IANA names are stored, so every viewer can format with it.
    await register("tz@example.com");
    const s = await logIn("tz@example.com");
    expect((await account(s).expect(200)).body.data).toEqual({ email: "tz@example.com", emailVerified: false, pendingEmail: null, timezone: null });

    const set = await request(app).patch("/api/v1/users/me/timezone").set(as(s)).send({ timezone: "Asia/Tbilisi" }).expect(200);
    expect(set.body.data.timezone).toBe("Asia/Tbilisi");
    expect((await logIn("tz@example.com")).userId).toBe(s.userId);
    const login = await request(app).post("/api/v1/auth/login").send({ email: "tz@example.com", password: PASSWORD }).expect(200);
    expect(login.body.user.timezone).toBe("Asia/Tbilisi"); // the session carries it, so the web app can format times

    const bad = await request(app).patch("/api/v1/users/me/timezone").set(as(s)).send({ timezone: "Mars/Olympus_Mons" }).expect(400);
    expect(bad.body.error.details.timezone).toEqual(["That is not a timezone name."]);
    expect((await account(s)).body.data.timezone).toBe("Asia/Tbilisi"); // unchanged

    expect((await request(app).patch("/api/v1/users/me/timezone").set(as(s)).send({ timezone: null }).expect(200)).body.data.timezone).toBeNull();
    await request(app).patch("/api/v1/users/me/timezone").send({ timezone: "UTC" }).expect(401);
  });
});

describe("account: change password", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("needs the right current password and a different new one, with the problem named under the right field", async () => {
    // Why: a stolen session alone must not be enough to take over the account.
    await register("pw@example.com");
    const s = await logIn("pw@example.com");
    const wrong = await change(s, { currentPassword: "nope-nope", newPassword: "another-pass-1" }).expect(400);
    expect(wrong.body.error.details.currentPassword).toEqual(["Current password is incorrect."]);
    const same = await change(s, { currentPassword: PASSWORD, newPassword: PASSWORD }).expect(400);
    expect(same.body.error.details.newPassword).toBeDefined();
    const short = await change(s, { currentPassword: PASSWORD, newPassword: "short" }).expect(400);
    expect(short.body.error.details.newPassword).toBeDefined();
    await logIn("pw@example.com"); // the password is unchanged
    await request(app).post("/api/v1/auth/change-password").send({ currentPassword: PASSWORD, newPassword: "another-pass-1" }).expect(401);
  });

  it("changes the password, keeps THIS session and signs every other one out", async () => {
    // Why: a changed password should end the sessions that might belong to someone else, not the one in use.
    await register("pw2@example.com");
    const here = await logIn("pw2@example.com");
    const elsewhere = await logIn("pw2@example.com"); // another browser: its own session family

    const res = await change(here, { currentPassword: PASSWORD, newPassword: "brand-new-pass-1" }).expect(200);
    expect(res.body.keptThisSession).toBe(true);

    await refresh(here).expect(200); // this device carries on
    await refresh(elsewhere).expect(401); // the other one is signed out
    await request(app).post("/api/v1/auth/login").send({ email: "pw2@example.com", password: PASSWORD }).expect(401); // old password dead
    await logIn("pw2@example.com", "brand-new-pass-1");
  });

  it("with no refresh cookie there is no 'this device': every session ends and the caller is told", async () => {
    // Why: never leave a session alive that cannot be identified as the caller's.
    await register("pw3@example.com");
    const here = await logIn("pw3@example.com");
    const other = await logIn("pw3@example.com");
    const res = await change(here, { currentPassword: PASSWORD, newPassword: "brand-new-pass-1" }, false).expect(200);
    expect(res.body.keptThisSession).toBe(false);
    await refresh(here).expect(401);
    await refresh(other).expect(401);
  });
});

describe("account: change email", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("a request needs the password, a new address, and one nobody has; it changes nothing yet", async () => {
    // Why: the address only changes when the link sent to the NEW address is opened.
    await register("old@example.com");
    await register("taken@example.com");
    const s = await logIn("old@example.com");
    const wrongPassword = await request(app).post("/api/v1/auth/email-change/request").set(as(s)).send({ newEmail: "new@example.com", password: "nope" }).expect(400);
    expect(wrongPassword.body.error.details.password).toEqual(["Password is incorrect."]);
    const same = await request(app).post("/api/v1/auth/email-change/request").set(as(s)).send({ newEmail: "OLD@example.com", password: PASSWORD }).expect(400);
    expect(same.body.error.details.newEmail).toEqual(["That is already your email."]);
    await request(app).post("/api/v1/auth/email-change/request").set(as(s)).send({ newEmail: "taken@example.com", password: PASSWORD }).expect(409);
    await request(app).post("/api/v1/auth/email-change/request").set(as(s)).send({ newEmail: "not-an-email", password: PASSWORD }).expect(400);
    await request(app).post("/api/v1/auth/email-change/request").send({ newEmail: "new@example.com", password: PASSWORD }).expect(401);

    const ok = await request(app).post("/api/v1/auth/email-change/request").set(as(s)).send({ newEmail: "New@Example.com", password: PASSWORD }).expect(202);
    expect(ok.body.pendingEmail).toBe("new@example.com"); // normalised
    const stored = await db.select().from(authTokens).where(and(eq(authTokens.userId, s.userId), eq(authTokens.purpose, "email_change")));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.newEmail).toBe("new@example.com");
    const acc = (await account(s)).body.data;
    expect(acc.email).toBe("old@example.com"); // not changed yet
    expect(acc.pendingEmail).toBe("new@example.com");
    await logIn("old@example.com"); // the old address still signs in
    await request(app).post("/api/v1/auth/login").send({ email: "new@example.com", password: PASSWORD }).expect(401);
  });

  it("a newer request replaces the older one, whose link then stops working", async () => {
    // Why: only the latest address asked for can be confirmed.
    await register("old@example.com");
    const s = await logIn("old@example.com");
    const first = await issueEmailChangeToken(s.userId, "first@example.com");
    await request(app).post("/api/v1/auth/email-change/request").set(as(s)).send({ newEmail: "second@example.com", password: PASSWORD }).expect(202);
    await request(app).post("/api/v1/auth/email-change/confirm").send({ token: first }).expect(400);
    expect((await account(s)).body.data.pendingEmail).toBe("second@example.com");
  });

  it("opening the link changes the email, verifies it, ends the pending request, and works once", async () => {
    // Why: the whole point. The link is single use; afterwards only the new address signs in.
    await register("old@example.com");
    const s = await logIn("old@example.com");
    const raw = await issueEmailChangeToken(s.userId, "new@example.com");
    await request(app).post("/api/v1/auth/email-change/confirm").send({ token: raw }).expect(204);

    const [row] = await db.select().from(users).where(eq(users.id, s.userId));
    expect(row?.email).toBe("new@example.com");
    expect(row?.emailVerifiedAt).not.toBeNull();
    await logIn("new@example.com");
    await request(app).post("/api/v1/auth/login").send({ email: "old@example.com", password: PASSWORD }).expect(401);
    expect((await account(await logIn("new@example.com"))).body.data.pendingEmail).toBeNull();
    await request(app).post("/api/v1/auth/email-change/confirm").send({ token: raw }).expect(400); // used
  });

  it("an expired, made-up or already-taken link changes nothing", async () => {
    // Why: expiry is enforced, and the address is re-checked at confirmation time (someone may have registered it since).
    await register("old@example.com");
    const s = await logIn("old@example.com");
    const expired = await issueEmailChangeToken(s.userId, "late@example.com", -1000);
    await request(app).post("/api/v1/auth/email-change/confirm").send({ token: expired }).expect(400);
    await request(app).post("/api/v1/auth/email-change/confirm").send({ token: "not-a-real-token" }).expect(400);

    const raw = await issueEmailChangeToken(s.userId, "race@example.com");
    await register("race@example.com"); // registered between the request and the click
    await request(app).post("/api/v1/auth/email-change/confirm").send({ token: raw }).expect(409);
    const [row] = await db.select().from(users).where(eq(users.id, s.userId));
    expect(row?.email).toBe("old@example.com");
  });
});
