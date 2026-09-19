import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });

// Let the pool close cleanly instead of leaving connections dangling when
// the process is asked to stop (Ctrl+C locally, SIGTERM from an
// orchestrator later).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void pool.end();
  });
}
