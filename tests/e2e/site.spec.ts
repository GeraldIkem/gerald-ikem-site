import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('home', () => {
  test('leads with the name, the role and a way to get in touch', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    // The cyan and magenta print plates are hidden from assistive tech, so the name reads once.
    await expect(page.getByRole('heading', { level: 1, name: 'Gerald Ikem', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Email me' })).toHaveAttribute('href', /^mailto:/);
    await expect(page.getByRole('link', { name: 'Download résumé' })).toHaveAttribute('href', /\.pdf$/);
    expect(errors).toEqual([]);
  });

  test('draws a trace of the visitor’s own request', async ({ page }) => {
    await page.goto('/');
    const trace = page.locator('page-trace');
    await expect(trace.locator('.trace__row').first()).toBeVisible();
    await expect(trace.locator('[data-total]')).toHaveText(/^Ready in [\d.]+ (ms|s)$/);
    await trace.locator('.trace__row').nth(1).focus();
    await expect(trace.locator('[data-detail]')).toContainText('started at');
  });

  test('refuses to charge the same reference twice', async ({ page }) => {
    await page.goto('/#payaza');
    const demo = page.locator('pay-demo');
    const pay = demo.getByRole('button', { name: 'Pay', exact: true });
    await pay.click();
    await pay.click();
    const entries = demo.locator('.pay__entry');
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toHaveAttribute('data-status', '409');
    await expect(entries.last()).toHaveAttribute('data-status', '201');
    await expect(demo.locator('[data-summary]')).toHaveText('2 requests, 1 charge.');

    await demo.getByRole('button', { name: 'New payment' }).click();
    await pay.click();
    await expect(demo.locator('[data-summary]')).toHaveText('3 requests, 2 charges.');
  });

  test('switches Linkify redirect scenarios', async ({ page }) => {
    await page.goto('/#linkify');
    const demo = page.locator('.redirect');
    await expect(demo.locator('[data-panel="hit"]')).toBeVisible();
    await expect(demo.locator('[data-panel="down"]')).toBeHidden();
    await demo.getByRole('radio', { name: 'Redis is down' }).check();
    await expect(demo.locator('[data-panel="down"]')).toBeVisible();
    await expect(demo.locator('[data-panel="hit"]')).toBeHidden();
  });

  test('career rows link to the role details', async ({ page }) => {
    await page.goto('/');
    await page.locator('.career__row[href="#payaza"]').click();
    await expect(page).toHaveURL(/#payaza$/);
    await expect(page.locator('#payaza')).toBeInViewport();
  });

  test('remembers the chosen theme', async ({ page }) => {
    await page.goto('/');
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('[data-theme-toggle]').click();
    await page.reload();
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(after).not.toBe(before);
  });
});

test.describe('off the clock', () => {
  test('pulls a book off the shelf and shows the note', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/off-the-clock/');
    const spine = page.locator('.spine[data-status="shelf"]').first();
    const title = await spine.getAttribute('data-title');
    await spine.click();
    await expect(spine).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-text] h3')).toHaveText(title ?? '');
    await expect(page.locator('.book3d .cover__title')).toHaveText((await spine.getAttribute('data-label')) ?? '');
    expect(errors).toEqual([]);
  });

  test('starts with a book already off the shelf and can pull another', async ({ page }) => {
    await page.goto('/off-the-clock/');
    await expect(page.locator('.book3d')).toHaveCount(1);
    const first = await page.locator('[data-text] h3').textContent();
    await page.getByRole('button', { name: 'Pull one at random' }).click();
    await expect(page.locator('[data-text] h3')).not.toHaveText(first ?? '');
    await expect(page.locator('.spine[aria-selected="true"]')).toHaveCount(1);
  });

  test('filters the shelf and never empties it', async ({ page }) => {
    await page.goto('/off-the-clock/');
    const wishlist = page.locator('.spine[data-status="wishlist"]');
    await expect(wishlist.first()).toBeHidden();
    await page.locator('[data-filter="wishlist"]').click();
    await expect(wishlist.first()).toBeVisible();

    for (const status of ['shelf', 'ordered', 'wishlist']) await page.locator(`[data-filter="${status}"]`).click();
    // The last filter still on (wishlist) cannot be switched off.
    await expect(page.locator('[data-filter][aria-pressed="true"]')).toHaveCount(1);
  });

  test('moves through the shelf with the arrow keys', async ({ page }) => {
    await page.goto('/off-the-clock/');
    const first = page.locator('.spine:not([hidden])').first();
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.spine:not([hidden])').nth(1)).toBeFocused();
  });
});

test('unknown addresses get the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
});

for (const path of ['/', '/off-the-clock/']) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${path} has no serious accessibility problems in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await page.locator('page-trace .trace__row, comic-shelf .spine:not([hidden])').first().waitFor();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
