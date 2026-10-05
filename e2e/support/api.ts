import { expect, type APIRequestContext } from "@playwright/test";
import { TEST_USER } from "./fixtures";

/**
 * Fast setup through the real HTTP API, for data a test needs but is not
 * itself testing (the UI forms for these are covered by their own tests).
 */
export async function createIssueViaApi(
  request: APIRequestContext,
  input: { projectName: string; projectKey: string; titles: string[] },
) {
  const login = await request.post("/api/v1/auth/login", {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  expect(login.status()).toBe(200);
  const { accessToken, organization } = await login.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const base = `/api/v1/organizations/${organization.id}`;

  const project = await request.post(`${base}/projects`, {
    headers,
    data: { name: input.projectName, key: input.projectKey },
  });
  expect(project.status()).toBe(201);
  const projectId = (await project.json()).data.id as string;

  const issueIds: string[] = [];
  for (const title of input.titles) {
    const issue = await request.post(`${base}/projects/${projectId}/issues`, {
      headers,
      data: { title },
    });
    expect(issue.status()).toBe(201);
    issueIds.push((await issue.json()).data.id as string);
  }
  return { projectId, issueIds };
}

export async function apiSession(request: APIRequestContext) {
  const login = await request.post("/api/v1/auth/login", {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  expect(login.status()).toBe(200);
  const { accessToken, organization } = await login.json();
  return {
    headers: { Authorization: `Bearer ${accessToken}` },
    base: `/api/v1/organizations/${organization.id}`,
  };
}

export async function createLabelViaApi(
  request: APIRequestContext,
  name: string,
  color: string,
) {
  const { headers, base } = await apiSession(request);
  const res = await request.post(`${base}/labels`, { headers, data: { name, color } });
  expect(res.status()).toBe(201);
}

export async function createSprintViaApi(
  request: APIRequestContext,
  projectId: string,
  name: string,
) {
  const { headers, base } = await apiSession(request);
  const res = await request.post(`${base}/projects/${projectId}/sprints`, {
    headers,
    data: { name },
  });
  expect(res.status()).toBe(201);
}

/** Sets an issue's priority through the API. The issue must be untouched (version 1). */
export async function setIssuePriorityViaApi(
  request: APIRequestContext,
  projectId: string,
  issueId: string,
  priority: "none" | "low" | "medium" | "high" | "urgent",
) {
  const { headers, base } = await apiSession(request);
  const res = await request.patch(`${base}/projects/${projectId}/issues/${issueId}`, {
    headers,
    data: { version: 1, priority },
  });
  expect(res.status()).toBe(200);
}

/** Sets an issue's due date ("YYYY-MM-DD") through the API. The issue must be untouched (version 1). */
export async function setIssueDueDateViaApi(request: APIRequestContext, projectId: string, issueId: string, dueDate: string) {
  const { headers, base } = await apiSession(request);
  const res = await request.patch(`${base}/projects/${projectId}/issues/${issueId}`, { headers, data: { version: 1, dueDate } });
  expect(res.status()).toBe(200);
}

/** Sets the test user's timezone through the API (an IANA name, or null for the browser's). */
export async function setTimezoneViaApi(request: APIRequestContext, timezone: string | null) {
  const { headers } = await apiSession(request);
  const res = await request.patch("/api/v1/users/me/timezone", { headers, data: { timezone } });
  expect(res.status()).toBe(200);
}
