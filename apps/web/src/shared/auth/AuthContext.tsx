import { useCallback, useEffect, useState, type ReactNode } from "react";
import { authSessionSchema } from "@flowdesk/contracts";
import { apiPost, apiPostVoid } from "../api/client";
import { AuthContext, type AuthUser } from "./auth-context";

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
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback((session: { accessToken: string; user: AuthUser }) => {
    setUser(session.user);
    setAccessToken(session.accessToken);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
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
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
