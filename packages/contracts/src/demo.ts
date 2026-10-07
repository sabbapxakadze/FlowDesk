import { z } from "zod";

/**
 * "Try the demo" (ADR 0044). `enabled` is whether this server offers it at all (the landing page shows the button only then);
 * `ttlMinutes` is how long a visitor's private copy lives before it is deleted (the page tells the visitor).
 * Starting a demo answers with the same body as logging in (`authSessionSchema`).
 */
export const demoInfoResponseSchema = z.object({
  data: z.object({ enabled: z.boolean(), ttlMinutes: z.number().int().positive() }),
});
export type DemoInfoResponse = z.infer<typeof demoInfoResponseSchema>;
