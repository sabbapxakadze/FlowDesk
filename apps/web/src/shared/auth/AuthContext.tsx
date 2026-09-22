import { useCallback, useEffect, useState, type ReactNode } from "react";
import { authSessionSchema, type AuthSession } from "@flowdesk/contracts";
import { apiPost, apiPostVoid } from "../api/client";
import { setStoredAccessToken } from "./token-store";
import { AuthContext, type AuthOrganization, type AuthUser } from "./auth-context";

/**
 * The access token lives here, in memory, and nowhere else — never
 * localStorage (see ADR 0003: an XSS bug can't steal what was never
 * stored). The cost of that choice is that a page reload wipes it, since
 * memory doesn't survive a reload. The silent refresh below is what pays
 * that cost back: it uses the httpOnly refresh cookie (which *does*
 * survive a reload) to get a new access token automatically, so the user
 * doesn't have to log in again every time they refresh the page.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<AuthOrganization | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback((session: AuthSession) => {
    setUser(session.user);
    setOrganization(session.organization);
    setAccessToken(session.accessToken);
    // The React state above is what triggers re-renders; the token store
    // is what shared/api/client.ts's fetch wrapper actually reads — kept
    // in sync here, on every login, so the next API call carries it.
    setStoredAccessToken(session.accessToken);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setOrganization(null);
    setAccessToken(null);
    setStoredAccessToken(null);
    // Local state clears immediately either way; telling the server to
    // revoke the session is best-effort and shouldn't block the UI on it.
    void apiPostVoid("/v1/auth/logout");
  }, []);

  useEffect(() => {
    apiPost("/v1/auth/refresh", undefined, authSessionSchema)
      .then(login)
      .catch(() => {
        // No valid cookie, or it's expired/already used — just means
        // nobody's logged in. Not an error worth surfacing.
      })
      .finally(() => setIsLoading(false));
  }, [login]);

  return (
    <AuthContext.Provider value={{ user, organization, accessToken, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
