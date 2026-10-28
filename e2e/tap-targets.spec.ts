import type { Page } from '@playwright/test';
import { expect, test, visit } from './fixtures';

/**
 * Tap targets on a phone. Every visible interactive element in the main UI must be at least 44×44 CSS px,
 * the size Apple's HIG and WCAG 2.5.5 (AAA) ask for. (WCAG 2.5.8 AA only asks for 24px; we hold the higher bar.)
 *
 * Exempt, because the size is not ours to set or the guidance exempts it:
 * - Leaflet's attribution links: legal attribution text, left as it is.
 * - Links inside a running sentence: WCAG exempts "inline" targets, and padding them would break the line.
 * - Visually hidden elements (skip links, screen-reader-only controls) and anything not rendered.
 */
const MIN = 44;
const TOLERANCE = 0.5; // sub-pixel rounding

const INTERACTIVE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="link"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface Target {
  target: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Which of the GROUPS selectors this element matches. */
  groups: string[];
}

/**
 * Sets of neighbouring controls whose hit areas must not overlap, so a tap lands on one of them and not the other.
 * (Cards that stretch one link over the whole card overlap on purpose, so they are not listed here.)
 */
const GROUPS = {
  chips: '.ledger-tier-chip',
  mapControls: '.leaflet-control .leaflet-bar a',
  footerLinks: '.footer-links a',
  themeOptions: '.theme-toggle-option input',
  costChips: '.near-me-cost-chip',
};

/**
 * Finds interactive elements smaller than the minimum. The hit area is the element's own box, or the box of
 * its `::before` / `::after` when that pseudo-element extends it (a transparent hit extension), whichever is larger.
 */
async function measureTargets(page: Page): Promise<Target[]> {
  return page.evaluate(
    ({ selector, groups, min, tolerance }) => {
      const describe = (el: Element): string => {
        const id = el.id ? `#${el.id}` : '';
        const classes = [...el.classList]
          .slice(0, 3)
          .map((c) => `.${c}`)
          .join('');
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40);
        const where = el.closest('[id]')?.id ? ` in #${el.closest('[id]')!.id}` : '';
        return `<${el.tagName.toLowerCase()}${id}${classes}> "${label}"${where}`;
      };

      /** The area a finger can land on: the element, plus any positioned pseudo-element that grows it. */
      const hitBox = (el: Element) => {
        const rect = el.getBoundingClientRect();
        let left = rect.left;
        let top = rect.top;
        let right = rect.right;
        let bottom = rect.bottom;
        for (const pseudo of ['::before', '::after'] as const) {
          const style = getComputedStyle(el, pseudo);
          if (style.content === 'none' || style.position !== 'absolute') continue;
          if (style.pointerEvents === 'none' || style.display === 'none') continue;
          const w = parseFloat(style.width);
          const h = parseFloat(style.height);
          if (Number.isNaN(w) || Number.isNaN(h)) continue;
          // An absolutely positioned pseudo is placed against the element's padding box; resolve its offsets.
          const resolve = (value: string, fallback: number) =>
            value === 'auto' ? fallback : parseFloat(value);
          const pLeft = rect.left + resolve(style.left, 0);
          const pTop = rect.top + resolve(style.top, 0);
          left = Math.min(left, pLeft);
          top = Math.min(top, pTop);
          right = Math.max(right, pLeft + w);
          bottom = Math.max(bottom, pTop + h);
        }
        return { left, top, width: right - left, height: bottom - top };
      };

      const isInlineInText = (el: Element): boolean => {
        if (el.tagName !== 'A') return false;
        if (getComputedStyle(el).display !== 'inline') return false;
        // Inline in a sentence: the link has text siblings in the same block.
        const parent = el.parentElement;
        if (!parent) return false;
        return [...parent.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0
        );
      };

      const found: {
        target: string;
        left: number;
        top: number;
        width: number;
        height: number;
        groups: string[];
      }[] = [];
      for (const el of document.querySelectorAll(selector)) {
        if (el.closest('.leaflet-control-attribution')) continue;
        if (el.closest('[inert], [aria-hidden="true"]')) continue;
        if (!(el as HTMLElement).checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }))
          continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Visually hidden (sr-only / skip link before focus): clipped to a pixel.
        if (rect.width <= 1 || rect.height <= 1) continue;
        if (isInlineInText(el)) continue;
        // A non-labelled form control that is hidden behind a styled label (custom switches, radios): the label is the target.
        if (
          el instanceof HTMLInputElement &&
          (el.type === 'checkbox' || el.type === 'radio') &&
          el.labels?.length
        ) {
          const labelRect = el.labels[0].getBoundingClientRect();
          if (labelRect.width >= min - tolerance && labelRect.height >= min - tolerance) continue;
        }
        const box = hitBox(el);
        found.push({
          target: describe(el),
          left: box.left,
          top: box.top,
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
          groups: Object.entries(groups)
            .filter(([, sel]) => el.matches(sel))
            .map(([name]) => name),
        });
      }
      return found;
    },
    { selector: INTERACTIVE, groups: GROUPS, min: MIN, tolerance: TOLERANCE }
  );
}

/** The targets under the minimum, as readable lines (empty when every target is big enough). */
async function undersizedTargets(page: Page): Promise<string[]> {
  return (await measureTargets(page))
    .filter((t) => t.width < MIN - TOLERANCE || t.height < MIN - TOLERANCE)
    .map((t) => `${t.width}×${t.height}  ${t.target}`);
}

/** Pairs of neighbouring controls (see GROUPS) whose hit areas intersect. */
async function overlappingTargets(page: Page): Promise<string[]> {
  const targets = await measureTargets(page);
  const overlaps: string[] = [];
  for (const group of Object.keys(GROUPS)) {
    const members = targets.filter((t) => t.groups.includes(group));
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        const overlapX = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
        if (overlapX > TOLERANCE && overlapY > TOLERANCE)
          overlaps.push(
            `${group}: ${a.target} overlaps ${b.target} by ${Math.round(overlapX)}×${Math.round(overlapY)}`
          );
      }
    }
  }
  return overlaps;
}

test.describe('tap targets at 390px (touch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the home page: map controls, filter chips, panels', async ({ page, monitor }) => {
    await visit(page, '/');
    // The coarse-pointer rules are what is under test: make sure this context really is one.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      'emulated touch pointer'
    ).toBe(true);
    await expect(page.locator('.leaflet-control-zoom')).toBeVisible();
    expect(await undersizedTargets(page)).toEqual([]);
    expect(await overlappingTargets(page), 'overlapping hit areas').toEqual([]);

    // The "Refine the Ledger" panel: reset button, cost brackets, selects.
    await page.getByRole('button', { name: /secondary filters/ }).click();
    await expect(page.locator('#ledger-secondary-filters')).toBeVisible();
    expect(await undersizedTargets(page)).toEqual([]);
    expect(await overlappingTargets(page), 'overlapping hit areas').toEqual([]);
    expect(monitor.errors).toEqual([]);
  });

  test('Near Me controls, with location granted', async ({ page, context, monitor }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 53.4808, longitude: -2.2515 });
    await visit(page, '/');
    await page.locator('#btn-near-me').click();
    await expect(page.getByRole('dialog', { name: 'Near Me Locate Mode' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ranked Nearby Venues' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await undersizedTargets(page)).toEqual([]);
    expect(await overlappingTargets(page), 'overlapping hit areas').toEqual([]);
    expect(monitor.errors).toEqual([]);
  });

  test('a venue page', async ({ page, monitor }) => {
    await visit(page, '/verdicts/approved');
    const venuePath = await page.locator('a[href^="/venues/"]').first().getAttribute('href');
    expect(venuePath, 'a venue link on the Approved verdict page').toBeTruthy();
    await visit(page, venuePath!);
    expect(await undersizedTargets(page)).toEqual([]);
    expect(await overlappingTargets(page), 'overlapping hit areas').toEqual([]);
    expect(monitor.errors).toEqual([]);
  });

  test('the Where to today? oracle options', async ({ page, monitor }) => {
    await visit(page, '/');
    await page.locator('.where-today-cta').click();
    const oracle = page.getByRole('dialog', { name: /Executive Decision Oracle/ });
    await expect(oracle).toBeVisible();
    expect(await undersizedTargets(page)).toEqual([]);
    expect(await overlappingTargets(page), 'overlapping hit areas').toEqual([]);
    await page.keyboard.press('Escape');
    expect(monitor.errors).toEqual([]);
  });
});

test.describe('desktop (fine pointer)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps the compact control sizes', async ({ page, monitor }) => {
    await visit(page, '/');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      'a fine pointer'
    ).toBe(false);
    const size = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { width: Math.round(rect.width), height: Math.round(rect.height) };
        });
    expect(await size('.leaflet-control-zoom-in')).toEqual({ width: 30, height: 30 });
    expect(await size('.ledger-reset-control a')).toEqual({ width: 30, height: 30 });
    expect((await size('.ledger-tier-chip')).height, 'tier chip height').toBeLessThan(40);
    expect(monitor.errors).toEqual([]);
  });
});
