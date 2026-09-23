import type { Request, Response } from "express";
import {
  createLabelRequestSchema,
  createLabelResponseSchema,
  listLabelsResponseSchema,
} from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as labelsService from "./labels.service.js";

function toWireFormat(row: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function listLabels(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listLabels requires requireOrgMembership to have run first");
  }

  const rows = await labelsService.listLabels(req.ctx.organizationId);
  const body = listLabelsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function createLabel(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("createLabel requires requireOrgMembership to have run first");
  }

  const parsed = createLabelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid label details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const label = await labelsService.createLabel({
    organizationId: req.ctx.organizationId,
    name: parsed.data.name,
    color: parsed.data.color,
  });

  const body = createLabelResponseSchema.parse({ data: toWireFormat(label) });
  res.status(201).json(body);
}
