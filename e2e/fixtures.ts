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
    await page.exposeFunction('__reportCsp', (violation: Violation) => monitor.violations.push(violation));
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
