import type { Page } from '@playwright/test';
import { expect, signInAsMember, test, visit } from './fixtures';

/**
 * People's Inspections (#137) against the built site, with the `members` flag on:
 *
 *   MEMBERS_FLAG=on pnpm build && MEMBERS_FLAG=on pnpm check:built e2e/member-inspections.spec.ts
 *
 * The seeded member logs a lunch, sees it in their history and on the venue page, and deletes it,
 * so the run leaves nothing behind and can be repeated the same day. The log pages render on
 * demand and follow the server's flag; the venue page's section is prerendered, so its checks run
 * only when the build had the flag on too (CI serves a flag-off build with the flag on).
 */

test.skip(
  process.env.MEMBERS_FLAG !== 'on' || Boolean(process.env.SMOKE_BASE_URL),
  'runs against the local build with MEMBERS_FLAG=on'
);

/** The prerendered venue page's People's Inspections section, present only in a flag-on build. */
const publicSection = (page: Page) =>
  page.getByRole('region', { name: 'Recent inspections from the public' });

async function venueSlug(page: Page): Promise<string> {
  await visit(page, '/verdicts/approved');
  const href = await page.locator('a[href^="/venues/"]').first().getAttribute('href');
  expect(href, 'a venue link on the Approved verdict page').toBeTruthy();
  return href!.replace(/^\/venues\//, '').replace(/\/$/, '');
}

/** Deletes any lunch the member can still delete, so a failed earlier run doesn't block this one. */
async function deleteEditableLogs(page: Page) {
  await visit(page, '/members/me/inspections');
  const history = page.getByTestId('member-inspection-history');
  while ((await history.getByRole('button', { name: 'Delete' }).count()) > 0) {
    await history.getByRole('button', { name: 'Delete' }).first().click();
    await history.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(history.getByRole('status')).toContainText('is deleted');
  }
}

test('a signed-out visitor sees the public feed and is sent to sign in to log', async ({
  page,
}) => {
  const slug = await venueSlug(page);
  await visit(page, `/venues/${slug}`);
  const section = publicSection(page);
  test.skip((await section.count()) === 0, 'the site was built with the members flag off');
  await section.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('public-inspections')).toHaveAttribute('data-state', 'ready');

  await section.getByRole('link', { name: 'Log a lunch' }).click();
  await page.waitForURL(/\/members\/sign-in/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(`/log/${slug}`);
});

test('the member logs a lunch, sees it, and deletes it', async ({ page, baseURL }) => {
  test.slow();
  await signInAsMember(page, baseURL!);
  await deleteEditableLogs(page);

  const slug = await venueSlug(page);
  await visit(page, `/log/${slug}`);
  const form = page.getByTestId('log-lunch-form');
  await expect(form).toBeVisible();
  const dish = `Test pie ${Date.now().toString(36)}`;
  await form.getByRole('textbox', { name: 'What you ate' }).fill(dish);
  await form.getByRole('textbox', { name: /Price paid/ }).fill('8.50');
  await form.getByRole('group', { name: 'The food' }).locator('label').nth(3).click();
  await form.getByRole('group', { name: 'Value for money' }).locator('label').nth(4).click();
  await form.getByRole('group', { name: 'Would you go back?' }).getByText('Yes').click();
  await form.getByRole('group', { name: 'Your verdict' }).getByText('Approve').click();
  await form.getByRole('textbox', { name: /One line for the ledger/ }).fill('A pie of note.');
  await page.getByTestId('log-lunch-save').click();

  await page.waitForURL(/\/members\/me\/inspections\?saved/);
  const entry = page.getByTestId('member-inspection').filter({ hasText: dish });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('£8.50');

  // One lunch a day: the form gives way to the day's log.
  await visit(page, `/log/${slug}`);
  await expect(page.getByTestId('logged-today')).toContainText(dish);

  // The venue page's feed shows it, without the member's email (in a flag-on build).
  await visit(page, `/venues/${slug}`);
  if (await publicSection(page).count()) {
    const feed = page.getByTestId('public-inspections');
    await feed.scrollIntoViewIfNeeded();
    await expect(feed).toContainText(dish);
    await expect(feed).not.toContainText('@');
  }

  await deleteEditableLogs(page);
  await expect(page.getByTestId('member-inspection').filter({ hasText: dish })).toHaveCount(0);
});
