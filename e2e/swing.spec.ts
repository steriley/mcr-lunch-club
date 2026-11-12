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

test('below a quorum the People’s Verdict stays hidden and the public feed says why', async ({
  page,
}) => {
  const slug = await venueSlug(page, 'approved');
  await visit(page, `/venues/${slug}`);
  const section = page.getByRole('region', { name: 'Recent inspections from the public' });
  test.skip((await section.count()) === 0, 'the site was built with the members flag off');
  await section.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('public-inspections')).toHaveAttribute('data-state', 'ready');
  // A fresh local database has no quorum: the note explains it, and the meter's section is hidden.
  await expect(page.getByTestId('verdict-pending')).toContainText('Two-Visit Rule');
  await expect(page.getByTestId('verdict-pending')).toContainText('5 members');
  await expect(page.getByRole('region', { name: 'The People’s Verdict' })).toHaveCount(0);
  await expect(page.getByTestId('swing-bar')).toHaveCount(0);
});

test('the note fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const slug = await venueSlug(page, 'approved');
  await visit(page, `/venues/${slug}`);
  const section = page.getByRole('region', { name: 'Recent inspections from the public' });
  test.skip((await section.count()) === 0, 'the site was built with the members flag off');
  await section.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('public-inspections')).toHaveAttribute('data-state', 'ready');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('The Count, rendered on demand, runs in a browser within its CSP', async ({
  page,
  monitor,
}) => {
  // The first public page on the public Layout that renders on demand: its policy is sent before
  // components run, so any inline script Astro could only hash on a prerendered page would show
  // up here as a violation (the fixture fails the test on any).
  await visit(page, '/the-count');
  await expect(page.getByRole('heading', { name: 'The Count' })).toBeVisible();
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  expect(monitor.violations).toEqual([]);
  expect(monitor.errors).toEqual([]);
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
