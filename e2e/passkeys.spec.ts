import type { CDPSession, Page } from '@playwright/test';
import { chairPassword, expect, signIn, test, visit } from './fixtures';

/**
 * Chairs' passkeys (#153) against the built site, with Chromium's virtual authenticator standing
 * in for a phone or laptop. Cross-device sign-in (a QR code and a phone) cannot be simulated here.
 */

const KEY_NAME = 'E2E virtual key';

async function addVirtualAuthenticator(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return client;
}

async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** Presses "Sign in with a passkey", unless the browser's passkey autofill already signed in. */
async function signInWithPasskey(page: Page) {
  await visit(page, '/admin/login');
  if (!new URL(page.url()).pathname.startsWith('/admin/login')) return;
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
}

async function removeTestKeys(page: Page) {
  await visit(page, '/admin/account');
  const settings = page.getByTestId('passkey-settings');
  await expect(settings.getByText(/Loading passkeys/)).toHaveCount(0);
  const rows = settings.getByTestId('passkey-row').filter({ hasText: KEY_NAME });
  while ((await rows.count()) > 0) {
    await rows.first().getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(settings.getByRole('status')).toContainText('removed');
  }
}

test.describe('Chairs’ passkeys', () => {
  test.skip(
    Boolean(process.env.SMOKE_BASE_URL),
    'adds a passkey to the Chair; runs against the local build only'
  );

  test('add a passkey, sign in with it, remove it, and the password still works', async ({
    page,
    monitor,
  }) => {
    // Two password sign-ins: after the rest of the suite, one may wait out Better Auth's rate limit.
    test.setTimeout(90_000);
    await addVirtualAuthenticator(page);
    await signIn(page);
    await removeTestKeys(page);

    // Adding one needs the password first.
    const settings = page.getByTestId('passkey-settings');
    await settings.getByRole('button', { name: 'Add a passkey' }).click();
    await settings.getByLabel(/name/i).fill(KEY_NAME);
    await settings.getByLabel('Your password').fill('not-the-password');
    await settings.getByRole('button', { name: 'Continue' }).click();
    await expect(settings.getByText('That password isn’t right.')).toBeVisible();

    await settings.getByLabel('Your password').fill(chairPassword!);
    await settings.getByRole('button', { name: 'Continue' }).click();
    await expect(settings.getByRole('status')).toContainText('Passkey added');
    await expect(settings.getByTestId('passkey-row').filter({ hasText: KEY_NAME })).toHaveCount(1);

    // Signed out, the passkey alone signs the Chair in.
    await signOut(page);
    await signInWithPasskey(page);
    await page.waitForURL((url) => url.pathname === '/admin');

    // Removed, it no longer works; the password still does.
    await removeTestKeys(page);
    await signOut(page);
    await signInWithPasskey(page);
    await expect(page.getByText('That passkey didn’t work')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/admin/login');
    await signIn(page);
    expect(new URL(page.url()).pathname.startsWith('/admin')).toBe(true);

    expect(monitor.violations).toEqual([]);
  });

  test('without an authenticator the sign-in page still offers the password form', async ({
    page,
  }) => {
    await visit(page, '/admin/login');
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  });
});
