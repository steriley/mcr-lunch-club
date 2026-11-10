import type { Page, Response } from '@playwright/test';
import { expect, test, visit } from './fixtures';

/**
 * Members and the public pages (#136, PR a; epic #135 "Performance budget"), against the built site.
 *
 * - The seeded test member is bounced from the Chairs' Area and its API.
 * - A signed-out visitor to the prerendered pages makes no member or auth request, and the pages
 *   load no auth or passkey code, within a fixed JavaScript budget.
 */

const memberEmail = process.env.SEED_MEMBER_EMAIL ?? 'member@lunch.test';
const memberPassword = process.env.SEED_MEMBER_PASSWORD ?? 'local-member-password';

/**
 * JavaScript a signed-out visit to a venue page may download, in bytes (uncompressed). Set from
 * the size when the budget was introduced plus a small margin; raising it is a deliberate,
 * reviewed change (epic #135, "Performance budget").
 */
const VENUE_PAGE_JS_BUDGET = 300_000;

/** Code that must never reach a public page: the auth client and the WebAuthn library. */
const AUTH_CODE_MARKERS = ['better-auth', '@simplewebauthn', 'startAuthentication', '/passkey/'];

async function venuePath(page: Page): Promise<string> {
  await visit(page, '/verdicts/approved');
  const href = await page.locator('a[href^="/venues/"]').first().getAttribute('href');
  expect(href, 'a venue link on the Approved verdict page').toBeTruthy();
  return href!;
}

test.describe('the test member', () => {
  test.skip(
    Boolean(process.env.SMOKE_BASE_URL),
    'member passwords are refused on deployments; runs against the local build only'
  );

  test('is bounced from the Chairs’ Area and its API', async ({ page, baseURL, monitor }) => {
    const signIn = await page.request.post('/api/auth/sign-in/email', {
      data: { email: memberEmail, password: memberPassword },
      headers: { origin: baseURL! },
    });
    expect(signIn.status(), 'the seeded member signs in locally').toBe(200);

    for (const path of ['/admin', '/admin/venues', '/admin/users', '/admin/account']) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} for a member`).toBe(403);
    }
    expect((await page.request.get('/api/admin/session')).status()).toBe(403);
    const write = await page.request.post('/api/admin/venues', {
      data: {},
      headers: { origin: baseURL! },
    });
    expect(write.status(), 'an admin write for a member').toBe(403);

    // The Chairs' sign-in page doesn't treat a member as signed in.
    await visit(page, '/admin/login');
    expect(new URL(page.url()).pathname).toBe('/admin/login');
    monitor.clear();
  });
});

test.describe('public pages for a signed-out visitor', () => {
  test('make no member or auth request', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/member') || pathname.startsWith('/api/auth')) {
        calls.push(pathname);
      }
    });

    const venue = await venuePath(page);
    for (const path of ['/', venue, '/verdicts/approved', '/hall-of-shame']) {
      await visit(page, path);
    }
    expect(calls).toEqual([]);
  });

  test('a venue page loads no auth code and stays within its JavaScript budget', async ({
    page,
  }) => {
    const venue = await venuePath(page);
    // A fresh page, so only the venue page's own scripts are counted.
    const scripts: Response[] = [];
    const fresh = await page.context().newPage();
    fresh.on('response', (response) => {
      if (response.request().resourceType() === 'script') scripts.push(response);
    });
    await visit(fresh, venue);

    let total = 0;
    for (const response of scripts) {
      const body = await response.body().catch(() => Buffer.alloc(0));
      total += body.length;
      const text = body.toString('utf8');
      for (const marker of AUTH_CODE_MARKERS) {
        expect(
          text.includes(marker),
          `${new URL(response.url()).pathname} contains ${marker}`
        ).toBe(false);
      }
    }
    console.log(`[budget] venue page JavaScript: ${total} bytes (budget ${VENUE_PAGE_JS_BUDGET})`);
    expect(total, 'venue page JavaScript, bytes').toBeLessThanOrEqual(VENUE_PAGE_JS_BUDGET);
    await fresh.close();
  });
});
