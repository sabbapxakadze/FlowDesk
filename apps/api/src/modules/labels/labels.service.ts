import { AppError } from "../../shared/errors.js";
import * as labelsRepository from "./labels.repository.js";

export async function listLabels(organizationId: string) {
  return labelsRepository.listByOrganization(organizationId);
}

// This drizzle-orm version wraps the raw pg error in a DrizzleQueryError —
// code/constraint live on err.cause, not the top-level error. Checking
// the top level (as an earlier version of this helper elsewhere in the
// codebase does) silently never matches; verified by forcing a real
// duplicate-key insert and inspecting the actual error shape.
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const cause =
    typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505" &&
    (cause as { constraint?: unknown }).constraint === constraint
  );
}

export async function createLabel(input: { organizationId: string; name: string; color: string }) {
  try {
    return await labelsRepository.create(input);
  } catch (err) {
    if (isUniqueViolation(err, "labels_organization_id_name_unique")) {
      throw new AppError(
        "label_name_taken",
        409,
        "A label with this name already exists in this organization.",
      );
    }
    throw err;
  }
}
