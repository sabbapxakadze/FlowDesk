import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/db/test-setup.ts"],
    // Integration tests share one real database and TRUNCATE between
    // tests — running files in parallel would race on that shared state.
    fileParallelism: false,
  },
});
