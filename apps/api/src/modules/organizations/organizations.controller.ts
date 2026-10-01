import type { Request, Response } from "express";
import { listOrganizationMembersResponseSchema } from "@flowdesk/contracts";
import * as organizationsService from "./organizations.service.js";

export async function listMembers(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listMembers requires requireOrgMembership to have run first");
  }

  const rows = await organizationsService.listMembers(req.ctx.organizationId);
  res.json(listOrganizationMembersResponseSchema.parse({ data: rows }));
}
