import * as organizationsRepository from "./organizations.repository.js";

export async function listMembers(organizationId: string) {
  return organizationsRepository.listMembers(organizationId);
}
