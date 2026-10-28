import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Same files the app reads, so BETTER_AUTH_URL and SEED_CHAIR_* match what `pnpm db:local` wrote.
for (const file of ['.env.local', '.env']) if (existsSync(file)) process.loadEnvFile(file);

/**
 * Browser smoke test of the production build (`pnpm build` first). Without SMOKE_BASE_URL it starts
 * `pnpm serve:build` on the port of BETTER_AUTH_URL; with it, it tests that deployment instead
 * (a Vercel Preview, say), signing in as the Chair named by SMOKE_CHAIR_EMAIL / SMOKE_CHAIR_PASSWORD.
 */
const remote = process.env.SMOKE_BASE_URL;
const baseURL = remote ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';

export default defineConfig({
  testDir: 'e2e',
  // Tests share one site and (locally) one database; the suite is small enough to run in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    // A Vercel Preview behind Deployment Protection accepts this header; see README.
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : {},
  },
  webServer: remote
    ? undefined
    : {
        command: 'pnpm serve:build',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
