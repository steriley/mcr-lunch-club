import type { Page } from '@playwright/test';
import { expect, test, visit } from './fixtures';

/**
 * The Swing-o-meter (#138) against the built site, with the `members` flag on:
 *
 *   MEMBERS_FLAG=on pnpm build && MEMBERS_FLAG=on pnpm check:built e2e/swing.spec.ts
 *
 * The prerendered venue page carries the meter only in a flag-on build; The Count and the API
 * render on demand and follow the server's flag.
 */

test.skip(
  process.env.MEMBERS_FLAG !== 'on' || Boolean(process.env.SMOKE_BASE_URL),
  'runs against the local build with MEMBERS_FLAG=on'
);

async function venueSlug(page: Page, tier: string): Promise<string> {
  await visit(page, `/verdicts/${tier}`);
  const href = await page.locator('a[href^="/venues/"]').first().getAttribute('href');
  expect(href, `a venue link on the ${tier} verdict page`).toBeTruthy();
  return href!.replace(/^\/venues\//, '').replace(/\/$/, '');
}

test('an Approved venue shows the meter, with the Chairs’ band marked and polls open', async ({
  page,
}) => {
  const slug = await venueSlug(page, 'approved');
  await visit(page, `/venues/${slug}`);
  const section = page.getByRole('region', { name: 'The Swing-o-meter' });
  test.skip((await section.count()) === 0, 'the site was built with the members flag off');
  await section.scrollIntoViewIfNeeded();
  const meter = page.getByTestId('swing-o-meter');
  await expect(meter).toHaveAttribute('data-state', 'ready');
  await expect(meter.getByText('Unofficial · not a verdict')).toBeVisible();
  // Three bands, labelled in text so colour is never the only signal.
  for (const label of ['Rejected', 'If We Must', 'Approved']) {
    await expect(meter.locator('.swing-label', { hasText: label })).toBeVisible();
  }
  await expect(meter.locator('.swing-seal')).toHaveCount(1);
  // A fresh local database has no quorum: no bar, polls open.
  await expect(page.getByTestId('swing-headline')).toHaveText(/Polls Open|The People/);
});

test('the meter fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const slug = await venueSlug(page, 'approved');
  await visit(page, `/venues/${slug}`);
  const section = page.getByRole('region', { name: 'The Swing-o-meter' });
  test.skip((await section.count()) === 0, 'the site was built with the members flag off');
  await section.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('swing-o-meter')).toHaveAttribute('data-state', 'ready');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the API and The Count answer, and carry nothing about members', async ({ request }) => {
  const count = await request.get('/the-count');
  expect(count.status()).toBe(200);
  expect(count.headers()['cache-control']).toContain('s-maxage=300');
  expect(await count.text()).toContain('The Count');

  const json = await request.get('/api/public/the-count');
  expect(json.status()).toBe(200);
  expect(json.headers()['cache-control']).toContain('stale-while-revalidate=600');
  expect(JSON.stringify(await json.json())).not.toMatch(/email|member_?id/i);

  expect((await request.get('/api/public/venues/no-such-venue/swing')).status()).toBe(404);
});
