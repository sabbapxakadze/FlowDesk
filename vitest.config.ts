import { defineConfig } from "vitest/config";

/**
 * Minimal root config so `pnpm test` is real from day one. No test files
 * exist yet — the first one is a Phase 1 item (an integration test against
 * a real Postgres database). This just proves the runner is wired up.
 */
export default defineConfig({
  test: {
    include: ["apps/**/src/**/*.test.ts", "packages/**/src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
