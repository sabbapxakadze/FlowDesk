import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * The production smoke test (ADR 0046): the BUILT app, served by the one API process exactly as Render will run it (`node dist/index.js`
 * with NODE_ENV=production, SERVE_WEB, RUN_MIGRATIONS), against the flowdesk_test database, on its own port (4200). No Vite, no dev proxy.
 * Run with `pnpm test:e2e:prod`, which builds first. Not part of the normal e2e run (that tests the pieces in development mode).
 *
 * NODE_ENV=production means the rate limiters are ON here (unlike under "test"), so the specs keep their sign-ups and logins few.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL("../apps/api/.env", import.meta.url)));
} catch {
  // no .env file: fine if the variables are already in the environment
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set to run e2e tests (see apps/api/.env.example)");
}

const PORT = 4200;

export default defineConfig({
  testDir: "./prod",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  outputDir: "../test-results/prod",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    name: "production server",
    command: "node --env-file-if-exists=.env dist/index.js",
    cwd: "../apps/api",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
      PORT: String(PORT),
      DATABASE_URL: testDatabaseUrl,
      UPLOADS_DIR: "./uploads-e2e",
      APP_URL: `http://localhost:${PORT}`,
      SERVE_WEB: "true",
      RUN_MIGRATIONS: "true",
      TRUST_PROXY: "0",
      DEMO_ENABLED: "true",
      OAUTH_FAKE: "false",
      RESEND_API_KEY: "e2e-dummy-key",
    },
  },
});
