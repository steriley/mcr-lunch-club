import type { Locator, Page } from '@playwright/test';
import { expect, test, visit } from './fixtures';

/**
 * Near Me on a phone: what the first view shows, and that the floating controls, the attribution and
 * the sheet leave the nearest venues and each other alone. Runs at 390×844 (an iPhone 13) with the
 * user in Manchester city centre.
 */
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  geolocation: { latitude: 53.4808, longitude: -2.2515 },
  permissions: ['geolocation'],
});

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

async function box(locator: Locator): Promise<Box> {
  const rect = await locator.evaluate((el) => {
    const { left, top, right, bottom } = el.getBoundingClientRect();
    return { left, top, right, bottom };
  });
  return rect;
}

/** The pin and its number badge, which sticks out past the pin's top right corner. */
async function pinBox(pin: Locator): Promise<Box> {
  return pin.evaluate((el) => {
    const rects = [el, ...el.querySelectorAll('span.bg-gold')].map((node) =>
      node.getBoundingClientRect()
    );
    return {
      left: Math.min(...rects.map((r) => r.left)),
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    };
  });
}

async function openNearMe(page: Page) {
  await visit(page, '/');
  await page.locator('#btn-near-me').click();
  const dialog = page.getByRole('dialog', { name: 'Near Me Locate Mode' });
  await expect(dialog).toBeVisible();
  // The first fix fits the nearest pins, and the sheet's height settles.
  await expect(page.locator('.near-me-shell .custom-ledger-pin:has(span.bg-gold)')).toHaveCount(5);
  await page.waitForTimeout(1500);
  return dialog;
}

test.describe('Near Me on a phone', () => {
  test('after the first fix, no nearest-3 marker sits under a control', async ({
    page,
    monitor,
  }) => {
    await openNearMe(page);

    const controls = [
      '#btn-near-me-close',
      '#btn-near-me-recenter',
      '#btn-near-me-home',
      '#btn-near-me-manual',
    ];
    const controlBoxes = await Promise.all(controls.map((id) => box(page.locator(id))));
    const pins = page.locator('.near-me-shell .custom-ledger-pin:has(span.bg-gold)');
    const nearest = [];
    for (let i = 0; i < (await pins.count()); i++) {
      const pin = pins.nth(i);
      const rank = Number((await pin.locator('span.bg-gold').textContent())?.trim());
      if (rank <= 3) nearest.push({ rank, box: await pinBox(pin) });
    }
    expect(nearest).toHaveLength(3);
    for (const { rank, box: markerBox } of nearest) {
      controlBoxes.forEach((controlBox, index) => {
        expect(overlaps(markerBox, controlBox), `marker #${rank} under ${controls[index]}`).toBe(
          false
        );
      });
    }
    expect(monitor.errors).toEqual([]);
  });

  test('opens with at least half the screen showing the map', async ({ page }) => {
    await openNearMe(page);
    const close = await box(page.locator('#btn-near-me-close'));
    const sheet = await box(page.locator('#near-me-panel'));
    const viewportHeight = page.viewportSize()!.height;
    expect((sheet.top - close.bottom) / viewportHeight).toBeGreaterThanOrEqual(0.5);
    await expect(page.locator('#near-me-panel')).toHaveClass(/snap-peek/);
    // The peek shows the handle, the tier chips and the nearest card, whole.
    const nearestCard = await box(page.locator('#near-me-panel [id^="near-me-row-"]').first());
    expect(nearestCard.bottom).toBeLessThanOrEqual(sheet.bottom);
  });

  test('the attribution stays readable at every sheet height', async ({ page }) => {
    await openNearMe(page);
    const attribution = page.locator('.near-me-shell .leaflet-control-attribution');
    const handle = page.locator('.near-me-snap-btn');
    const seen: string[] = [];
    for (let step = 0; step < 4; step++) {
      await page.waitForTimeout(500);
      const snap = (await page.locator('#near-me-panel').getAttribute('class'))!.match(
        /snap-(\w+)/
      )![1];
      seen.push(snap);
      const text = await box(attribution);
      const sheet = await box(page.locator('#near-me-panel'));
      expect(text.bottom, `${snap}: attribution above the sheet`).toBeLessThanOrEqual(sheet.top);
      expect(text.left, `${snap}: attribution on screen`).toBeGreaterThanOrEqual(0);
      expect(text.right, `${snap}: attribution on screen`).toBeLessThanOrEqual(390);
      // The controls hide at full height; at every other height none may cover the attribution.
      if (snap !== 'full') {
        for (const id of ['#btn-near-me-recenter', '#btn-near-me-home', '#btn-near-me-manual']) {
          expect(overlaps(text, await box(page.locator(id))), `${snap}: ${id}`).toBe(false);
        }
      }
      await handle.click();
    }
    expect(seen).toEqual(['peek', 'half', 'full', 'collapsed']);
  });

  test('the tier chips scroll sideways, with an edge fade', async ({ page }) => {
    await openNearMe(page);
    const chips = page.locator('#near-me-panel .tier-filter-chips');
    const scrolls = await chips.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls, 'more chips than fit').toBe(true);
    const mask = await chips.evaluate((el) => getComputedStyle(el).maskImage);
    expect(mask).not.toBe('none');
    // Nothing but the chips sits in the filter row: no stray icon.
    await expect(page.locator('#near-me-panel .near-me-panel-filters > *')).toHaveCount(1);
    const before = await chips.evaluate((el) => el.scrollLeft);
    await chips.evaluate((el) => el.scrollBy({ left: 80 }));
    expect(await chips.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  });

  test('the price pills are compact and sit under the heading', async ({ page }) => {
    await openNearMe(page);
    const body = page.locator('.near-me-scroll-body');
    const pills = page.locator('.near-me-cost-chip');
    await pills.first().scrollIntoViewIfNeeded();
    const heading = await box(page.locator('.near-me-list-title', { hasText: /also nearby/i }));
    for (let i = 0; i < 3; i++) {
      const pill = await box(pills.nth(i));
      expect(pill.top, 'below the heading').toBeGreaterThanOrEqual(heading.bottom);
      expect(pill.bottom - pill.top, 'as tall as a tier chip').toBeLessThanOrEqual(32);
    }
    await expect(body).toBeVisible();
  });

  test('Escape still closes it, and the controls keep their labels', async ({ page, monitor }) => {
    const dialog = await openNearMe(page);
    await expect(page.getByRole('button', { name: 'Recentre on me' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to Spinningfields Base' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set location manually' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(monitor.errors).toEqual([]);
  });
});
