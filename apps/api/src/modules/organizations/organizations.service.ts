import * as organizationsRepository from "./organizations.repository.js";

export async function listMembers(organizationId: string) {
  const rows = await organizationsRepository.listMembers(organizationId);
  return rows.map((row) => ({ ...row, joinedAt: row.joinedAt.toISOString() }));
}
