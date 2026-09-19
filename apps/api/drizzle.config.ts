import { defineConfig } from "drizzle-kit";

// drizzle-kit runs standalone (not through the app's Zod-validated env),
// so this file loads .env itself. Optional: CI can set DATABASE_URL
// directly with no .env file present.
try {
  process.loadEnvFile(new URL(".env", import.meta.url));
} catch {
  // no .env file — fine if DATABASE_URL is already in the environment
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set — see apps/api/.env.example");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
