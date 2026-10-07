import { z } from "zod";

/**
 * Zod "jitless": validate without compiling code from strings. By default Zod tries `new Function(...)` to speed up parsing and, when a strict
 * Content-Security-Policy refuses it, falls back quietly; but the browser still REPORTS the refusal as a policy violation (a console error
 * in production). The policy we send has no 'unsafe-eval' on purpose (ADR 0046), so this turns the attempt off. The speed difference is
 * irrelevant at the size of our forms and responses.
 *
 * Imported FIRST in main.tsx, so it runs before the shared schemas (packages/contracts) are created.
 */
z.config({ jitless: true });
