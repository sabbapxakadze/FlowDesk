import { registerResponseSchema, type RegisterRequest } from "@flowdesk/contracts";
import { apiPost } from "../../../shared/api/client";

export function registerUser(input: RegisterRequest) {
  return apiPost("/v1/auth/register", input, registerResponseSchema);
}
