import { expect, test, visit } from './fixtures';

/** The homepage map frames the core of the matching venues on a phone, and hints at the rest. */
test.describe('homepage map framing', () => {
  test('a phone sees clusters around Base and a "further out" pill that shows everything', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, '/');
    const pill = page.locator('.map-outliers');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText(/^\d+ more further out · Show all\s*$/);

    // No single cluster holds most of the venues on show.
    const shown = Number(
      (await page.locator('.map-header-count').textContent())!.match(/^(\d+) of/)![1]
    );
    const counts = await page
      .locator('.ledger-cluster-inner')
      .evaluateAll((els) => els.map((el) => Number(el.textContent?.trim()) || 0));
    expect(Math.max(0, ...counts)).toBeLessThan(shown / 2);

    await pill.click();
    await expect(pill).toBeHidden();
  });

  test('a wide map frames every venue, so there is nothing further out', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await visit(page, '/');
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.map-outliers')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show all matching venues' })).toBeVisible();
  });
});
