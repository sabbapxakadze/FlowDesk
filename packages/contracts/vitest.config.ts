import { defineConfig } from "vitest/config";

// Pure tests of the shared contracts (no database, no setup file).
export default defineConfig({
  test: { name: "contracts", environment: "node", include: ["src/**/*.test.ts"] },
});
