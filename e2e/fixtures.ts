import { expect, test as base, type Page } from '@playwright/test';

export interface Violation {
  directive: string;
  blocked: string;
  page: string;
}

export interface Monitor {
  violations: Violation[];
  errors: string[];
  /** Forget what was seen so far: for a test that provokes a violation on purpose. */
  clear(): void;
}

/**
 * Every page in these tests reports Content-Security-Policy violations and uncaught errors, and a
 * test fails if any turn up. The DOM `securitypolicyviolation` event is the source: Chromium does
 * not write CSP violations to the console, so scraping console messages would miss them.
 */
export const test = base.extend<{ monitor: Monitor }>({
  monitor: async ({ page }, use) => {
    const monitor: Monitor = {
      violations: [],
      errors: [],
      clear() {
        this.violations.length = 0;
        this.errors.length = 0;
      },
    };
    // Survives navigations, unlike a window global.
    await page.exposeFunction('__reportCsp', (violation: Violation) =>
      monitor.violations.push(violation)
    );
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as any).__reportCsp({
          directive: event.effectiveDirective,
          blocked: event.blockedURI || event.sample || '(inline)',
          page: location.pathname,
        });
      });
    });
    page.on('pageerror', (error) => {
      // Astro's view transitions reject when a test navigates again mid-transition; not a site fault.
      if (/Transition was aborted because of invalid state/.test(error.message)) return;
      monitor.errors.push(`${new URL(page.url()).pathname}: ${error.message}`);
    });

    await use(monitor);

    expect(monitor.violations, 'Content-Security-Policy violations').toEqual([]);
    expect(monitor.errors, 'uncaught page errors').toEqual([]);
  },
});

export { expect };

/** Opens a page and lets its islands hydrate, so anything they get blocked from doing is reported. */
export async function visit(page: Page, path: string, expectedStatus = 200): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(expectedStatus);
  await page.waitForLoadState('networkidle');
}

export const chairEmail = process.env.SMOKE_CHAIR_EMAIL ?? process.env.SEED_CHAIR_EMAIL;
export const chairPassword = process.env.SMOKE_CHAIR_PASSWORD ?? process.env.SEED_CHAIR_PASSWORD;

/** Signs in as the seeded (or smoke) Chair with their password. */
export async function signIn(page: Page) {
  expect(
    chairEmail && chairPassword,
    'SEED_CHAIR_EMAIL / SEED_CHAIR_PASSWORD (or SMOKE_CHAIR_*) must name a Chair'
  ).toBeTruthy();
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/email/i).fill(chairEmail!);
  await page.getByLabel(/password/i).fill(chairPassword!);
  // Better Auth allows a few sign-ins per ten seconds, and several tests sign in back to back:
  // when it answers 429, wait out the window and press again.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = page.waitForResponse((response) => response.url().includes('/api/auth/sign-in'));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const response = await answer;
    if (response.status() !== 429) break;
    const retryAfter = Number(response.headers()['x-retry-after']) || 10;
    await page.waitForTimeout(retryAfter * 1000 + 500);
  }
  await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'));
  await page.waitForLoadState('networkidle');
}

export const memberEmail = process.env.SEED_MEMBER_EMAIL ?? 'member@lunch.test';
const memberPassword = process.env.SEED_MEMBER_PASSWORD ?? 'local-member-password';

/**
 * Signs in as the seeded test member with its local-only password (#136), waiting out Better
 * Auth's sign-in rate limit like `signIn`. Members have no password on any deployment.
 */
export async function signInAsMember(page: Page, baseURL: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.post('/api/auth/sign-in/email', {
      data: { email: memberEmail, password: memberPassword },
      headers: { origin: baseURL },
    });
    if (response.status() !== 429) {
      expect(response.status(), 'the seeded member signs in locally').toBe(200);
      return;
    }
    const retryAfter = Number(response.headers()['x-retry-after']) || 10;
    await page.waitForTimeout(retryAfter * 1000 + 500);
  }
  throw new Error('The seeded member could not sign in: still rate-limited.');
}
