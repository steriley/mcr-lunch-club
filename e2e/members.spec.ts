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

    // The readable signed-in hint follows the session (epic #135), for page scripts to check.
    const hint = (await page.context().cookies()).find((cookie) => cookie.name === 'signed_in');
    expect(hint?.value).toBe('1');
    expect(hint?.httpOnly).toBe(false);

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

    // Signing out clears it.
    const signOut = await page.request.post('/api/auth/sign-out', {
      data: {},
      headers: { origin: baseURL! },
    });
    expect(signOut.status()).toBe(200);
    const cleared = (await page.context().cookies()).find((cookie) => cookie.name === 'signed_in');
    expect(cleared).toBeUndefined();
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
    // Below-the-fold islands (client:visible, e.g. the route map) load only when scrolled to, and a
    // visitor who scrolls downloads them too, so they count.
    await fresh.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });
    await fresh.waitForLoadState('networkidle');

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

test.describe('member sign-in with the members flag off (#136)', () => {
  test.skip(
    Boolean(process.env.SMOKE_BASE_URL) || process.env.MEMBERS_FLAG === 'on',
    'the local build runs with the members flag off'
  );

  test('every member page, member API and email sign-in endpoint answers 404', async ({
    page,
    baseURL,
  }) => {
    const headers = { origin: baseURL! };
    for (const path of ['/members', '/members/me']) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    expect((await page.request.get('/api/member/sign-in')).status()).toBe(404);
    for (const path of [
      '/api/member/sign-in',
      '/api/auth/sign-in/magic-link',
      '/api/auth/email-otp/send-verification-otp',
      '/api/auth/email-otp/request-password-reset',
      '/api/auth/sign-in/email-otp',
    ]) {
      const response = await page.request.post(path, {
        data: { email: 'someone@example.com' },
        headers,
      });
      expect(response.status(), path).toBe(404);
    }
    expect((await page.request.get('/api/auth/magic-link/verify?token=x')).status()).toBe(404);
  });
});
