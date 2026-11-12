import { expect, signIn, test, visit } from './fixtures';

/**
 * The public contact form and the Chairs' inbox (#132), against the built site. The happy path is
 * real: the message is stored, found in the inbox, checked to render as plain text, and deleted
 * again, which also gives back the sender's allowance so repeated runs stay under the limits.
 */
test.describe('contact the Chairs', () => {
  test('a message reaches the inbox as plain text, and the Chairs can handle and delete it', async ({
    page,
    monitor,
  }) => {
    // Signing in may wait out Better Auth's sign-in rate limit after the tests before this one.
    test.slow();
    const stamp = `smoke-${Date.now()}`;
    // Markup and links a visitor might paste: they must arrive as text, never as HTML or a link.
    const body = `Automated check ${stamp}.\n<b>not bold</b> <a href="https://evil.example">click</a> https://example.com`;

    await visit(page, '/contact');
    await expect(page.getByRole('heading', { name: 'Contact the Chairs' })).toBeVisible();
    const send = page.getByRole('button', { name: 'Send to the Chairs' });
    await expect(send).toBeEnabled();

    await page.getByLabel('Your name').fill('Smoke Test');
    await page.getByLabel('Your email').fill('smoke@example.com');
    await page.getByLabel('Topic').selectOption('press');
    await page.getByLabel('Message').fill(body);
    const answer = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/contact') && response.request().method() === 'POST'
    );
    await send.click();
    expect((await answer).status()).toBe(201);
    const received = page.getByRole('heading', { name: 'Message received' });
    await expect(received).toBeVisible();
    await expect(received).toBeFocused();

    await signIn(page);
    await visit(page, '/admin/contact');
    const card = page.locator('[data-contact-message]', { hasText: stamp });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Press');
    await expect(card).toContainText('New');
    const text = card.locator('[data-contact-body]');
    await expect(text).toContainText('<b>not bold</b>');
    await expect(text.locator('b, a')).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Reply by email' })).toHaveAttribute(
      'href',
      /^mailto:smoke@example\.com\?subject=/
    );

    await card.getByRole('button', { name: 'Mark read' }).click();
    await expect(card.getByRole('button', { name: 'Mark read' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Mark handled' }).click();
    await expect(card).toHaveCount(0);

    await visit(page, '/admin/contact?view=handled');
    const handled = page.locator('[data-contact-message]', { hasText: stamp });
    await handled.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete message' }).click();
    await expect(page.getByText('Message deleted.')).toBeVisible();
    await expect(handled).toHaveCount(0);
    expect(monitor.errors).toEqual([]);
  });

  test('a form with mistakes is not sent, and says what to fix', async ({ page }) => {
    let posted = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/contact') && request.method() === 'POST') posted += 1;
    });
    await visit(page, '/contact');
    await page.getByLabel('Your name').fill('A');
    await page.getByLabel('Your email').fill('not-an-email');
    await page.getByLabel('Message').fill('Too short');
    await page.getByRole('button', { name: 'Send to the Chairs' }).click();

    const summary = page.locator('[data-contact-summary]');
    await expect(summary).toBeFocused();
    await expect(summary).toContainText('Your name');
    await expect(summary).toContainText('Your email');
    await expect(summary).toContainText('Message');
    await expect(page.getByLabel('Your email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Your email')).toHaveAttribute(
      'aria-describedby',
      /contact-email-error/
    );
    expect(posted).toBe(0);
  });

  test('shows the fallback when the form is switched off', async ({ page }) => {
    await page.route('**/api/contact', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' })
    );
    await visit(page, '/contact');
    await expect(page.locator('[data-contact-disabled]')).toContainText('closed for now');
    await expect(page.getByRole('button', { name: 'Send to the Chairs' })).toHaveCount(0);
  });

  test('does not send or queue while offline, and keeps what was typed', async ({
    page,
    context,
  }) => {
    await visit(page, '/contact');
    await page.getByLabel('Message').fill('Written on the train, sent later.');
    await context.setOffline(true);
    await expect(page.getByText('You’re offline. Your message will still be here')).toBeVisible();
    await expect(page.locator('[data-contact-submit]')).toBeDisabled();
    await context.setOffline(false);
    await expect(page.locator('[data-contact-submit]')).toBeEnabled();
    await expect(page.getByLabel('Message')).toHaveValue('Written on the train, sent later.');
  });

  test('is linked from the footer, the FAQs and the 404 page', async ({ page }) => {
    await visit(page, '/faqs');
    await expect(page.locator('footer a[href="/contact"]')).toBeVisible();
    await expect(page.locator('main a[href="/contact"]').first()).toBeAttached();
    await visit(page, '/no-such-page', 404);
    await expect(page.locator('main a[href="/contact"]')).toBeVisible();
  });
});
