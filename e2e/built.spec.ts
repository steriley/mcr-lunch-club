import { expect, test, visit } from './fixtures';

/** The smallest valid WebAssembly module. */
const EMPTY_WASM = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
/** A 1×1 PNG, to feed the Chairs' Area WebP encoder. */
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const chairEmail = process.env.SMOKE_CHAIR_EMAIL ?? process.env.SEED_CHAIR_EMAIL;
const chairPassword = process.env.SMOKE_CHAIR_PASSWORD ?? process.env.SEED_CHAIR_PASSWORD;

test.describe('public pages', () => {
  test('home: map marker, theme toggle, Where to today?, suggest form', async ({ page, monitor }) => {
    await visit(page, '/');

    // Map: open a venue's card from its pin.
    const pin = page.locator('.custom-ledger-pin:has(.ledger-pin-name)').first();
    await expect(pin).toBeVisible();
    await pin.click();
    await expect(page.locator('.pin-card')).toBeVisible();

    // Theme toggle (footer): the choice lands on <html>.
    await page.locator('[data-theme-toggle] label', { hasText: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('[data-theme-toggle] label', { hasText: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Where to today?
    await page.locator('[data-open-where-today]:visible').first().click();
    const oracle = page.getByRole('dialog', { name: /Executive Decision Oracle/ });
    await expect(oracle).toBeVisible();
    await oracle.getByRole('button', { name: /Deliver the Uncontested Verdict/ }).click();
    await expect(oracle.getByRole('link').first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(oracle).toBeHidden();

    // Suggest form. The request is stubbed: the public form is rate-limited per sender, so repeated runs
    // (and any Preview) would otherwise fill the Chairs' inbox or be refused. The form and its CSP still run.
    await page.route('**/api/suggestions', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
    await page.goto('/#suggest-a-venue');
    const form = page.getByRole('dialog', { name: /Petition the Chairs/ });
    await expect(form).toBeVisible();
    await form.getByLabel('Establishment name').fill('Smoke Test Cafe');
    await form.getByLabel(/Address or street/).fill('1 Deansgate, Manchester');
    await form.getByLabel('Why does it merit attention?').fill('Automated smoke test.');
    await form.getByRole('button', { name: /Submit petition/ }).click();
    await expect(page.getByText('Petition received')).toBeVisible();
    expect(monitor.errors).toEqual([]);
  });

  test('Near Me, with location granted', async ({ browser, baseURL, monitor: _unused }, testInfo) => {
    void _unused;
    void testInfo;
    const context = await browser.newContext({
      baseURL,
      geolocation: { latitude: 53.4808, longitude: -2.2515 },
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    const violations: string[] = [];
    const errors: string[] = [];
    await page.exposeFunction('__reportCsp', (v: { directive: string; blocked: string }) => violations.push(`${v.directive} ${v.blocked}`));
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) => (window as any).__reportCsp({ directive: e.effectiveDirective, blocked: e.blockedURI || e.sample })),
    );
    page.on('pageerror', (error) => errors.push(error.message));

    await visit(page, '/');
    await page.locator('#btn-near-me').click();
    await expect(page.getByRole('dialog', { name: 'Near Me Locate Mode' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ranked Nearby Venues' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('verdict, venue, hall of shame, manifesto, inspections', async ({ page, monitor }) => {
    await visit(page, '/verdicts/approved');
    const venuePath = await page.locator('a[href^="/venues/"]').first().getAttribute('href');
    expect(venuePath, 'a venue link on the Approved verdict page').toBeTruthy();

    await visit(page, venuePath!);
    // JSON-LD: every block parses and names a type.
    const blocks = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
    expect(blocks.length, 'JSON-LD blocks on the venue page').toBeGreaterThan(0);
    for (const block of blocks) expect(JSON.parse(block)['@type']).toBeTruthy();

    for (const path of ['/hall-of-shame', '/manifesto', '/inspections']) await visit(page, path);
    expect(monitor.errors).toEqual([]);
  });

  test('404 page', async ({ page }) => {
    await visit(page, '/this-page-does-not-exist', 404);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });
});

test.describe('Content-Security-Policy', () => {
  async function injectInline(page: import('@playwright/test').Page) {
    return page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__inlineScriptRan = true';
      document.head.append(script);
      const style = document.createElement('style');
      style.textContent = 'body { outline: 7px solid rgb(1, 2, 3) !important }';
      document.head.append(style);
      return { scriptRan: Boolean((window as any).__inlineScriptRan), outline: getComputedStyle(document.body).outlineWidth };
    });
  }

  test('an injected inline <script> and <style> are blocked', async ({ page, monitor }) => {
    await visit(page, '/');
    const result = await injectInline(page);
    expect(result.scriptRan).toBe(false);
    expect(result.outline).not.toBe('7px');
    await expect.poll(() => monitor.violations.map((v) => v.directive).sort()).toEqual(expect.arrayContaining(['script-src-elem', 'style-src-elem']));
    monitor.clear();
  });

  test('WebAssembly is blocked on public pages', async ({ page, monitor }) => {
    await visit(page, '/');
    const outcome = await page.evaluate(async (bytes) => {
      try {
        await WebAssembly.compile(new Uint8Array(bytes));
        return 'compiled';
      } catch (error) {
        return String(error);
      }
    }, EMPTY_WASM);
    expect(outcome).not.toBe('compiled');
    monitor.clear();
  });

  test('WebAssembly is allowed in the Chairs’ Area', async ({ page, monitor }) => {
    await signIn(page);
    const outcome = await page.evaluate(async (bytes) => {
      try {
        await WebAssembly.compile(new Uint8Array(bytes));
        return 'compiled';
      } catch (error) {
        return String(error);
      }
    }, EMPTY_WASM);
    expect(outcome).toBe('compiled');
    expect(monitor.violations).toEqual([]);
  });
});

async function signIn(page: import('@playwright/test').Page) {
  expect(chairEmail && chairPassword, 'SEED_CHAIR_EMAIL / SEED_CHAIR_PASSWORD (or SMOKE_CHAIR_*) must name a Chair').toBeTruthy();
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/email/i).fill(chairEmail!);
  await page.getByLabel(/password/i).fill(chairPassword!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'));
  await page.waitForLoadState('networkidle');
}

test.describe('Chairs’ Area', () => {
  test('every page loads signed in, and the WebP encoder runs', async ({ page, monitor }) => {
    await signIn(page);

    await visit(page, '/admin/venues');
    const editPath = await page.locator('a[href^="/admin/venues/"]:not([href$="/new"]):not([href*="/history"])').first().getAttribute('href');
    expect(editPath, 'a venue edit link in the ledger').toBeTruthy();

    const briberyPath = await (async () => {
      await visit(page, '/admin/bribery');
      return page.locator('a[href^="/admin/bribery/"]:not([href$="/new"])').first().getAttribute('href');
    })();

    const paths = [
      '/admin',
      '/admin/venues/new',
      editPath!,
      `${editPath}/history`,
      '/admin/bribery/new',
      '/admin/golden-cut',
      '/admin/pending',
      '/admin/suggestions',
      '/admin/users',
      '/admin/account',
    ];
    if (briberyPath) paths.push(briberyPath);
    for (const path of paths) await visit(page, path);

    // The photo optimiser (WASM WebP encoder). The upload itself is stubbed: what matters is that
    // the encoder produced WebP, which it can only do while 'wasm-unsafe-eval' is allowed.
    await visit(page, editPath!);
    const picker = page.locator('input[type="file"]');
    expect(await picker.count(), 'the photo picker (needs BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID so uploads are enabled)').toBeGreaterThan(0);
    const upload = page.waitForRequest((request) => request.method() === 'POST' && /\/images$/.test(request.url()));
    await page.route(/\/api\/admin\/venues\/[^/]+\/images$/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"stubbed by the smoke test"}' }));
    await picker.setInputFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: PNG_1X1 });
    const body = (await upload).postDataBuffer()?.toString('latin1') ?? '';
    expect(body).toContain('RIFF');
    expect(body).toContain('WEBP');
    await expect(page.getByText(/could not convert this photo/)).toHaveCount(0);
    monitor.errors.length = 0; // the stubbed 500 is logged by the page as a console error only
    expect(monitor.violations).toEqual([]);
  });
});
