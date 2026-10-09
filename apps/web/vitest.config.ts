import { defineConfig } from "vitest/config";

// Tests of web code that need a browser-like page (the rich-text editor's Markdown and keyboard behaviour), run in jsdom. The real browser is
// covered by the Playwright suite in e2e/.
export default defineConfig({
  test: { name: "web", environment: "jsdom", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
