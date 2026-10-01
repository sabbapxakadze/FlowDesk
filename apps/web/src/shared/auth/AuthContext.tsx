import { useCallback, useEffect, useState, type ReactNode } from "react";
import { authSessionSchema, type AuthSession } from "@flowdesk/contracts";
import { apiPost, apiPostVoid } from "../api/client";
import { setStoredAccessToken } from "./token-store";
import { AuthContext, type AuthOrganization, type AuthUser } from "./auth-context";
import { connectSocket, disconnectSocket } from "../socket/socket-client";

// Shared by every caller while a refresh is in flight. React StrictMode runs
// the mount effect twice in development, which used to send two refresh
// requests carrying the same cookie. The server rotates the token on the first
// and treats the second as reuse of a spent token (a theft signal), revoking
// the whole session family, so the NEXT page load found no valid session and
// landed on the login page (about 40% of reloads in the e2e measurements).
// One request, shared, avoids it; the server's reuse detection is untouched.
let refreshInFlight: Promise<AuthSession> | null = null;

function refreshSession(): Promise<AuthSession> {
  refreshInFlight ??= apiPost("/v1/auth/refresh", undefined, authSessionSchema).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

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
    // Same lifecycle the access token itself already follows — connect
    // once we have both a token and the org to join.
    connectSocket(session.organization.id);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setOrganization(null);
    setAccessToken(null);
    setStoredAccessToken(null);
    disconnectSocket();
    // Local state clears immediately either way; telling the server to
    // revoke the session is best-effort and shouldn't block the UI on it.
    void apiPostVoid("/v1/auth/logout");
  }, []);

  useEffect(() => {
    refreshSession()
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
