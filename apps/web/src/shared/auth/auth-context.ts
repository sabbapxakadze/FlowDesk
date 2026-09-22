import { createContext } from "react";
import type { AuthSession } from "@flowdesk/contracts";

export type AuthUser = AuthSession["user"];
export type AuthOrganization = AuthSession["organization"];

export interface AuthContextValue {
  user: AuthUser | null;
  organization: AuthOrganization | null;
  accessToken: string | null;
  /** True only while the initial silent refresh (on page load) is in flight. */
  isLoading: boolean;
  login: (session: AuthSession) => void;
  logout: () => void;
}

// Split from AuthContext.tsx / useAuth.ts on purpose: a file that exports
// only components can be Fast-Refreshed by Vite; mixing in a plain value
// (the context object) or a hook breaks that. See eslint-plugin-react-refresh.
export const AuthContext = createContext<AuthContextValue | null>(null);
