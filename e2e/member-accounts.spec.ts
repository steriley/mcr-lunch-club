import { expect, memberEmail, signIn, signInAsMember, test, visit } from './fixtures';

/**
 * Member accounts with the `members` flag on (#136, PR c), against the built site:
 *
 *   MEMBERS_FLAG=on pnpm check:built e2e/member-accounts.spec.ts
 *
 * The member pages render on demand, so they follow the flag the server runs with. The header on
 * prerendered pages follows the flag the site was built with, so its checks run only when the
 * build had the flag on too (`MEMBERS_FLAG=on pnpm build`). The seeded member signs in with its
 * local password; email sign-in is covered by the database tests (no inbox here).
 */

/** The member link in the main nav, the one shown on wide screens (the tests run at desktop size). */
const mainNav = (selector: string) => `[data-member-header="main"] ${selector}`;

test.skip(
  process.env.MEMBERS_FLAG !== 'on' || Boolean(process.env.SMOKE_BASE_URL),
  'runs against the local build with MEMBERS_FLAG=on'
);

test('a signed-out visitor is sent to sign in, and the form asks for an email', async ({
  page,
}) => {
  await visit(page, '/members/me/data', 200, { settle: false });
  const url = new URL(page.url());
  expect(url.pathname).toBe('/members/sign-in');
  expect(url.searchParams.get('next')).toBe('/members/me/data');

  await expect(page.getByRole('heading', { name: 'Confirm it’s you' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sign in or join' })).toBeVisible();
  await expect(page.getByTestId('member-send-email')).toBeVisible();
  // The nav on this on-demand page offers sign-in, at the far right of the pill.
  const signInLink = page.locator(mainNav('[data-member-signed-out]'));
  await expect(signInLink).toBeVisible();
  // The last item (Astro renders the component's script after it).
  const lastInNav = page.locator('.site-header-inner > .site-nav > :not(script)').last();
  await expect(lastInNav).toHaveAttribute('data-member-header', 'main');
});

test('the sign-in form gets a Turnstile token, and the CSP lets the widget run (#136, PR d)', async ({
  page,
}) => {
  await visit(page, '/members/sign-in', 200, { settle: false });
  // The send button waits for a token. Cloudflare's test site key passes on its own (and shows
  // no frame), so an enabled button means its script, frame and connections were all allowed;
  // the monitor fixture fails the test on any Content-Security-Policy violation.
  await expect(page.getByTestId('member-send-email')).toBeDisabled();
  await expect(page.getByTestId('member-send-email')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/\S+/);
});

test('the member names themselves, chooses privacy and downloads their data', async ({
  page,
  baseURL,
}) => {
  await signInAsMember(page, baseURL!);
  await visit(page, '/members/me');
  await expect(page.getByTestId('member-profile')).toBeVisible();
  // The cards are islands (display: contents wrappers), so the page spaces them with a gap.
  const profileBox = (await page.getByTestId('member-profile').boundingBox())!;
  const passkeysBox = (await page.getByTestId('member-passkeys').boundingBox())!;
  expect(passkeysBox.y - (profileBox.y + profileBox.height)).toBeGreaterThanOrEqual(16);

  // Letters only, so it passes the shape rules, and new each run so it is never taken.
  const unique = Date.now()
    .toString(36)
    .replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)]);
  const name = `Tester ${unique}`.slice(0, 30);
  const field = page.getByRole('textbox', { name: 'Display name' });
  await field.fill(name);
  await page.getByTestId('member-save-name').click();
  await expect(page.getByRole('status')).toContainText('Display name saved.');

  const toggle = page.getByTestId('member-show-publicly');
  const wasPublic = await toggle.isChecked();
  await toggle.click();
  await expect(page.getByRole('status')).toContainText(wasPublic ? 'private' : 'publicly');

  // The header (hydrated from /api/member/session because of the signed_in hint) shows the name.
  await visit(page, '/members/me');
  await expect(page.locator(mainNav('[data-member-account]'))).toContainText(name);

  await visit(page, '/members/me/data');
  const download = page.waitForEvent('download');
  await page.getByTestId('member-export').click();
  const file = await (await download).path();
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(file, 'utf8'));
  expect(data.account.email).toBe(memberEmail);
  expect(data.profile.displayName).toBe(name);
  // Just signed in, so deleting is offered (not run: the seeded member is shared by the suite).
  await expect(page.getByTestId('member-delete-account')).toBeVisible();

  // A member is still kept out of the Chairs' Members list.
  expect((await page.goto('/admin/members'))?.status()).toBe(403);
});

test('the Chairs see members in their list, and the header links a Chair to the Chairs’ Area', async ({
  page,
}) => {
  // Its sign-in may wait out Better Auth's rate limit after the member's.
  test.slow();
  // Prerendered pages carry the header only when the site was built with the flag on.
  await visit(page, '/');
  const builtWithFlag = (await page.locator('[data-member-header]').count()) > 0;
  if (builtWithFlag) await expect(page.locator(mainNav('[data-member-signed-out]'))).toBeVisible();

  await signIn(page);
  await visit(page, '/admin/members');
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
  await expect(page.getByTestId('member-row').first()).toBeVisible();
  // No email addresses on the list.
  await expect(page.getByText(memberEmail)).toHaveCount(0);

  // A Chair has no member pages.
  await page.goto('/members/me');
  await page.waitForURL((url) => url.pathname === '/admin');

  if (builtWithFlag) {
    await visit(page, '/');
    await expect(page.locator(mainNav('[data-member-chair]'))).toBeVisible();
    await expect(page.locator(mainNav('[data-member-signed-out]'))).toBeHidden();
  }
});

test('on a phone, sign-in is the last item of the burger menu, not in the header bar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/members/sign-in', 200, { settle: false });
  // Nothing member-related shows in the bar itself.
  await expect(page.locator(mainNav('[data-member-signed-out]'))).toBeHidden();

  await page.locator('.mobile-menu-trigger').click();
  const menu = page.locator('.mobile-menu-panel .site-nav');
  const signInLink = menu.locator('[data-member-header="menu"] [data-member-signed-out]');
  await expect(signInLink).toBeVisible();
  await expect(menu.locator(':scope > :not(script)').last()).toHaveAttribute(
    'data-member-header',
    'menu'
  );
});
