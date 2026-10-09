import type { ReactNode } from "react";

/** A person the `@` list can offer: the caller supplies them, so the editor stays free of the domain. */
export type MentionCandidate = { id: string; name: string; icon?: ReactNode };
