/** The public URL of a photo (ADR 0028), or null for "show initials". Same origin as the API. */
export function avatarUrlFor(avatarKey: string | null): string | null {
  return avatarKey ? `/api/v1/avatars/${avatarKey}` : null;
}

/** The disk key a photo is stored under (see lib/storage.ts). */
export function avatarStorageKey(avatarKey: string): string {
  return `avatar-${avatarKey}`;
}
