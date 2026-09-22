/**
 * A plain module-level variable, not React state. shared/api/client.ts's
 * fetch wrapper functions live outside React and can't read a React
 * context — this is the bridge. AuthContext keeps this in sync alongside
 * its own state on every login/logout; nothing else should write to it.
 */
let currentAccessToken: string | null = null;

export function setStoredAccessToken(token: string | null): void {
  currentAccessToken = token;
}

export function getStoredAccessToken(): string | null {
  return currentAccessToken;
}
