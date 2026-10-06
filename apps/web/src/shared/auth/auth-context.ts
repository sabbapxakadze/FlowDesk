import { createContext } from "react";
import type { AuthSession } from "@flowdesk/contracts";

export type AuthUser = AuthSession["user"];
export type AuthOrganization = AuthSession["organization"];

/** Why a session ended without the person pressing "Log out": the login page says so. */
export type SessionEndReason = "expired" | "idle";

export interface AuthContextValue {
  user: AuthUser | null;
  organization: AuthOrganization | null;
  accessToken: string | null;
  /** True only while the initial silent refresh (on page load) is in flight. */
  isLoading: boolean;
  /** Set when the session ended on its own (it expired, or the person was inactive); cleared by the next login. */
  endedReason: SessionEndReason | null;
  login: (session: AuthSession) => void;
  logout: () => void;
  /** End the session because of `reason` (not a button press), so the login page can explain it. */
  endSession: (reason: SessionEndReason) => void;
}

// Split from AuthContext.tsx / useAuth.ts on purpose: a file that exports
// only components can be Fast-Refreshed by Vite; mixing in a plain value
// (the context object) or a hook breaks that. See eslint-plugin-react-refresh.
export const AuthContext = createContext<AuthContextValue | null>(null);
