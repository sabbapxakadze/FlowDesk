import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import * as schema from "./schema/index.js";

// Sized for a small hosted database (ADR 0049). `max`: a free Neon database allows only so many connections at once. `idleTimeoutMillis`:
// connections that sat unused for 30 s are closed by us, so a database that suspends itself after minutes of quiet never leaves us holding a
// dead one. `connectionTimeoutMillis`: a suspended Neon database takes a moment to wake, so the first connection may wait for it.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

// An idle connection that the database closes (a restart, a suspend) is reported here. Without a listener Node treats a pool "error" as an
// uncaught exception and the whole server stops; with one, the pool just drops that connection and opens a new one when it is needed.
pool.on("error", (err) => {
  logger.warn({ err }, "an idle database connection failed and was dropped");
});

export const db = drizzle(pool, { schema });

// The pool is closed by the server's clean shutdown (index.ts, lib/shutdown.ts), AFTER it has stopped taking requests; closing it here on the
// signal itself would pull the database away from requests that are still being answered. Scripts (seed, seed-demo) end the pool themselves.
