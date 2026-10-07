import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors.js";
import * as demoRepository from "./demo.repository.js";

/**
 * What a demo copy may not do (ADR 0044). "Try the demo" is a public endpoint that writes rows, so these are the doors it must not open:
 * sending email to any address (invitations), changing who the account is (email, password, a connected Google/GitHub account),
 * and storing files (uploads). They are enforced here, on the server, not by hiding buttons.
 *
 * ANY NEW FEATURE that sends email, stores files or changes account identity must be guarded the same way, or a demo visitor can use it.
 */

const DEMO_ISSUE_LIMIT = 300;

const restricted = (what: string) =>
  new AppError("demo_restricted", 403, `${what} is turned off in the demo. Create an account to use it.`);

/** For a route: refuses a demo user before anything else runs (before an upload body is even read). Needs `requireAuth` first. */
export function denyInDemo(what: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (await demoRepository.isDemoUser(req.auth!.userId)) throw restricted(what);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** The same check, for code that already has the user id (the OAuth "connect" start). */
export async function assertNotDemoUser(userId: string, what: string): Promise<void> {
  if (await demoRepository.isDemoUser(userId)) throw restricted(what);
}

/** A demo copy is capped at 300 issues, so one visitor cannot fill the database. Real organizations are not limited. */
export async function assertDemoHasRoomForIssue(organizationId: string): Promise<void> {
  if (!(await demoRepository.isDemoOrganization(organizationId))) return;
  if ((await demoRepository.countIssuesInOrganization(organizationId)) >= DEMO_ISSUE_LIMIT) {
    throw new AppError("demo_restricted", 403, `The demo is limited to ${DEMO_ISSUE_LIMIT} issues.`);
  }
}
