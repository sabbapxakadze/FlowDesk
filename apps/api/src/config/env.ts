import { z } from "zod";

/**
 * Every environment variable the API depends on is declared here. If one is
 * missing or malformed, the process must refuse to start — a crash at boot
 * is recoverable by a human reading a clear message; a crash on the first
 * request that happens to touch the missing config is not. See CLAUDE.md's
 * "Config" convention.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // Deliberately not using the pino logger here: logging itself depends on
    // LOG_LEVEL, which might be exactly what's malformed. Plain stderr only.
    console.error("Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
