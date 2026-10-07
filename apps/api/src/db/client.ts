import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });

// The pool is closed by the server's clean shutdown (index.ts, lib/shutdown.ts), AFTER it has stopped taking requests; closing it here on the
// signal itself would pull the database away from requests that are still being answered. Scripts (seed, seed-demo) end the pool themselves.
