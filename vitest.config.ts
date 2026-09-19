import { defineConfig } from "vitest/config";

/**
 * Monorepo test "projects" (Vitest 5 — replaced the separate
 * vitest.workspace.ts file from earlier Vitest versions). Each entry is a
 * directory containing its own vitest.config.ts; apps/api's needs a real
 * Postgres connection and a setup file, so it isn't shared config at the
 * root. apps/web gets an entry here once it has its own tests.
 */
export default defineConfig({
  test: {
    projects: ["apps/api"],
  },
});
