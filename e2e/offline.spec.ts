import type { Page } from '@playwright/test';
import { expect, test, visit } from './fixtures';

/**
 * Offline mode against the real build (`pnpm build && pnpm check:built`): the service worker
 * (src/sw/sw.ts) serves public pages from the device when there is no connection, and never stores
 * the Chairs' Area.
 */

/** Waits until the worker controls the page, so what is visited next is saved. */
async function controlled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    }
    return urls;
  });
}

test.describe('offline mode', () => {
  test('registers a worker on a public page, and it takes charge', async ({ page }) => {
    await visit(page, '/');
    await controlled(page);
    const scope = await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistration())?.scope
    );
    expect(scope).toBe(new URL('/', page.url()).href);
    // The manifest and install metadata are on the page.
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest'
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  });

  test('public pages open offline with the offline banner, and an unsaved page shows /offline', async ({
    page,
    context,
    baseURL,
  }) => {
    await visit(page, '/');
    await controlled(page);
    // Visit a venue page while the worker is in charge, so it is saved.
    const venuePath = await page.evaluate(async () => {
      const response = await fetch('/sitemap-0.xml');
      const text = await response.text();
      return [...text.matchAll(/<loc>[^<]*?(\/venues\/[^<]+?)<\/loc>/g)][0]?.[1] ?? null;
    });
    expect(venuePath, 'a venue page in the sitemap').toBeTruthy();
    await visit(page, venuePath!);
    await visit(page, '/verdicts/approved');

    await context.setOffline(true);

    for (const path of ['/', '/verdicts/approved', venuePath!]) {
      await page.goto(path);
      await expect(page.locator('[data-offline-bar]'), `${path} offline bar`).toContainText(
        /^\s*Offline · verdicts as of \d{1,2}(st|nd|rd|th) \w{3} \d{2}, \d{2}:\d{2}/
      );
      await expect(page.locator('h1').first()).toBeVisible();
    }

    // Trailing slash and query string reach the same saved page.
    await page.goto(`${venuePath}/?utm_source=test`);
    await expect(page.locator('[data-offline-bar]')).toBeVisible();

    // A page that was never saved.
    await page.goto('/venues/never-visited-nowhere-to-be-found');
    await expect(page.getByRole('heading', { name: /isn’t saved on this device/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Near Me' })).toBeVisible();

    await context.setOffline(false);
    await page.goto(baseURL ?? '/');
  });

  test('the Chairs’ Area says it needs a connection, and no /admin response is ever stored', async ({
    page,
    context,
  }) => {
    await visit(page, '/');
    await controlled(page);
    // Online, the sign-in page is visited through the worker.
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    await context.setOffline(true);
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: /Chairs’ Area needs a connection/ })
    ).toBeVisible();

    await context.setOffline(false);
    await page.goto('/');
    const urls = await cachedUrls(page);
    expect(urls.length, 'something is saved').toBeGreaterThan(0);
    expect(
      urls.filter(
        (url) => new URL(url).pathname.startsWith('/admin') && !url.endsWith('/chairs-offline')
      ),
      'no Chairs’ Area URL in Cache Storage'
    ).toEqual([]);
    expect(
      urls.filter((url) => /\/api\//.test(url)),
      'no API URL in Cache Storage'
    ).toEqual([]);
  });

  test('the map still renders its pins offline, with no tile errors breaking the page', async ({
    page,
    context,
  }) => {
    await visit(page, '/');
    await controlled(page);
    await visit(page, '/');

    await context.setOffline(true);
    await page.goto('/');
    const pin = page.locator('.custom-ledger-pin:has(.ledger-pin-name)').first();
    await expect(pin).toBeVisible();
    await pin.click();
    await expect(page.locator('.pin-card')).toBeVisible();
    // A tile that could not load stays invisible rather than showing a broken-image icon.
    const visibleUnloaded = await page.evaluate(
      () =>
        [...document.querySelectorAll('.leaflet-tile:not(.leaflet-tile-loaded)')].filter(
          (tile) => getComputedStyle(tile).visibility !== 'hidden'
        ).length
    );
    expect(visibleUnloaded).toBe(0);
    await context.setOffline(false);
  });

  test('the suggestion form is disabled offline and keeps what was typed', async ({
    page,
    context,
  }) => {
    await visit(page, '/');
    await controlled(page);
    await visit(page, '/');
    await page.goto('/#suggest-a-venue');
    const form = page.getByRole('dialog', { name: /Petition the Chairs/ });
    await expect(form).toBeVisible();
    await form.getByLabel('Establishment name').fill('Offline Cafe');
    const submit = form.getByRole('button', { name: /Submit petition/ });
    await expect(submit).toBeEnabled();

    await context.setOffline(true);
    await expect(submit).toBeDisabled();
    await expect(
      form.getByText(/You're offline\. Your suggestion will be here when you're back\./)
    ).toBeVisible();
    await expect(form.getByLabel('Establishment name')).toHaveValue('Offline Cafe');

    await context.setOffline(false);
    await expect(submit).toBeEnabled();
    await expect(form.getByLabel('Establishment name')).toHaveValue('Offline Cafe');
  });
});
