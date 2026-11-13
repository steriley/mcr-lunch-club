import type { Cookie, Locator, Page } from '@playwright/test';
import { expect, signIn, test, visit } from './fixtures';

/**
 * The shared dialog and combobox behaviour from Reka UI (src/components/ui, PlaceSearch), against the
 * built site: focus stays inside an open dialog, Escape closes it and focus goes back to what opened
 * it, and the venue search works from the keyboard. The CSP monitor in ./fixtures fails any test that
 * trips the policy, which is the other thing this checks (Reka sets some inline styles from script).
 */

const insideDialog = (dialog: Locator) =>
  dialog.evaluate((el) => el.contains(document.activeElement));

/** Tabs (or Shift+Tabs) past every control twice over and fails if focus ever leaves the dialog. */
async function expectFocusTrapped(page: Page, dialog: Locator) {
  const controls = await dialog.locator('input, button, textarea, select, a[href]').count();
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let press = 0; press < controls * 2 + 2; press += 1) {
      await page.keyboard.press(key);
      expect(await insideDialog(dialog), `focus inside the dialog after ${key} #${press + 1}`).toBe(
        true
      );
    }
  }
}

test.describe('public dialog (Suggest a Venue)', () => {
  test('traps focus, locks the page behind it, and returns focus on Escape', async ({
    page,
    monitor,
  }) => {
    await visit(page, '/');
    const trigger = page.locator('footer a[href="/#suggest-a-venue"]');
    await trigger.focus();
    await trigger.press('Enter');

    const dialog = page.getByRole('dialog', { name: /Petition the Chairs/ });
    await expect(dialog).toBeVisible();
    // First focus lands on the first field, not the close button.
    await expect(dialog.getByLabel('Establishment name')).toBeFocused();

    await expectFocusTrapped(page, dialog);

    // The page behind can't be scrolled or reached by assistive technology.
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    await expect(page.locator('body > header')).toHaveAttribute('aria-hidden', 'true');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    expect(new URL(page.url()).hash).toBe('');
    expect(monitor.violations, 'CSP violations').toEqual([]);
  });
});

test.describe('the Chairs’ Area dialogs and venue search', () => {
  // One sign-in for the group: Better Auth rate-limits sign-ins, and each test only needs the session.
  let session: Cookie[] = [];
  test.beforeAll(async ({ browser, baseURL }) => {
    // The earlier specs may have used up the sign-in limit; signIn waits out its window.
    test.setTimeout(120_000);
    const context = await browser.newContext({ baseURL });
    await signIn(await context.newPage());
    session = await context.cookies();
    await context.close();
  });
  test.beforeEach(async ({ context }) => {
    await context.addCookies(session);
  });

  async function openFirstVenue(page: Page) {
    await visit(page, '/admin/venues');
    const href = await page
      .locator('a[href^="/admin/venues/"]:not([href$="/new"])')
      .first()
      .getAttribute('href');
    expect(href, 'a venue to edit').toBeTruthy();
    await visit(page, href!);
  }

  test('a confirmation starts on Cancel, traps focus, and returns focus on Escape', async ({
    page,
    monitor,
  }) => {
    await openFirstVenue(page);
    const trigger = page.getByRole('button', { name: /Decommission listing|Reopen listing/ });
    await trigger.focus();
    await trigger.press('Enter');

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    // Cancel is the first button (this call site labels it "Abort").
    await expect(dialog.getByRole('button').first()).toBeFocused();
    await expectFocusTrapped(page, dialog);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(monitor.violations, 'CSP violations').toEqual([]);
  });

  test('Expunge starts on its field and stays locked until EXPUNGE is typed', async ({
    page,
    monitor,
  }) => {
    await openFirstVenue(page);
    const trigger = page.getByRole('button', { name: 'Expunge record' });
    await trigger.focus();
    await trigger.press('Enter');

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const field = dialog.getByLabel(/Type EXPUNGE to confirm/);
    await expect(field).toBeFocused();
    const confirm = dialog.getByRole('button', { name: 'Expunge record' });
    await expect(confirm).toBeDisabled();

    await field.fill('expunge');
    await expect(confirm).toBeDisabled();
    await field.fill('EXPUNGE');
    await expect(confirm).toBeEnabled();
    await expectFocusTrapped(page, dialog);

    // Never confirm: this only checks the dialog. Cancelling clears the word for next time.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.press('Enter');
    await expect(dialog.getByLabel(/Type EXPUNGE to confirm/)).toHaveValue('');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(monitor.violations, 'CSP violations').toEqual([]);
  });

  test('venue search is a combobox operated from the keyboard', async ({ page, monitor }) => {
    const places = [
      { label: 'Alpha Cafe', address: '1 Alpha Street, Manchester', lat: 53.48, lng: -2.24 },
      { label: 'Beta Deli', address: '2 Beta Street, Manchester', lat: 53.481, lng: -2.241 },
      { label: 'Gamma Grill', address: '3 Gamma Street, Manchester', lat: 53.482, lng: -2.242 },
    ];
    let query = '';
    await page.route('**/api/admin/geocode**', (route) => {
      query = new URL(route.request().url()).searchParams.get('q') ?? '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: places }),
      });
    });
    await visit(page, '/admin/venues/new');

    const input = page.getByRole('combobox', { name: 'Find the venue' });
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await input.focus();
    await page.keyboard.type('Alpha Street');
    // Nothing is shown while there is nothing to pick (the search is debounced).
    await expect(page.getByRole('listbox')).toHaveCount(0);
    const list = page.getByRole('listbox');
    await expect(list.getByRole('option')).toHaveCount(3);
    expect(query).toBe('Alpha Street');
    await expect(list).toBeVisible();
    await expect(input).toHaveAttribute('aria-expanded', 'true');

    // Escape closes the list and leaves the text; arrow keys reopen it.
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(input).toHaveValue('Alpha Street');
    await page.keyboard.press('ArrowDown');
    await expect(list).toBeVisible();

    // Down, Down, Enter picks the second result and fills the venue's location.
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option', { name: /Beta Deli/ })).toHaveAttribute(
      'data-highlighted',
      ''
    );
    await page.keyboard.press('Enter');
    await expect(input).toBeHidden();
    await expect(page.getByText('2 Beta Street, Manchester').first()).toBeVisible();
    expect(monitor.violations, 'CSP violations').toEqual([]);
  });
});
