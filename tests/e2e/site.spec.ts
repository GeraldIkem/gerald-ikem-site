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
  test('keeps LinkedIn, GitHub and the résumé in the header while scrolling', async ({ page }) => {
    await page.goto('/');
    await page.mouse.wheel(0, 2500);
    const header = page.locator('[data-site-header]');
    await expect(header.getByRole('link', { name: 'LinkedIn' })).toBeInViewport();
    await expect(header.getByRole('link', { name: 'GitHub' })).toBeInViewport();
    await expect(header.getByRole('link', { name: /Résumé/ })).toHaveAttribute('href', /\.pdf$/);
  });

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
    await page.goto('/projects/linkify/#the-redirect-path');
    const demo = page.locator('.redirect');
    await expect(demo.locator('[data-panel="hit"]')).toBeVisible();
    await expect(demo.locator('[data-panel="down"]')).toBeHidden();
    await demo.getByRole('radio', { name: 'Redis is down' }).check();
    await expect(demo.locator('[data-panel="down"]')).toBeVisible();
    await expect(demo.locator('[data-panel="hit"]')).toBeHidden();
  });

  test('the career story fills the skill bucket as you scroll', async ({ page, isMobile }) => {
    await page.goto('/');
    const story = page.locator('career-story');
    if (isMobile) {
      // Phones get the whole story at once, with the full bucket underneath.
      await expect(story).not.toHaveClass(/is-live/);
      await expect(story.locator('.chip[data-skill="Spring Boot"]')).toBeVisible();
      return;
    }
    await expect(story).toHaveClass(/is-live/);
    const springBoot = story.locator('.chip[data-skill="Spring Boot"]');
    await expect(springBoot).toBeHidden();
    const payaza = story.locator('[data-step]').filter({ hasText: 'Backend engineer' });
    await payaza.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(springBoot).toBeVisible();
    await expect(story.locator('[data-year]')).toHaveText('Nov 2025');
    await payaza.getByRole('link', { name: 'Backend engineer' }).click();
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
    // The book comes off the shelf as a 3D hardcover drawn by three.js.
    await expect(page.locator('.shelf__stage canvas')).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test('starts with a book already off the shelf and can pull another', async ({ page }) => {
    await page.goto('/off-the-clock/');
    await expect(page.locator('.shelf__stage canvas, .shelf__stage .book3d')).toHaveCount(1);
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

test('the off-the-clock tally jumps to each part of the page', async ({ page }) => {
  await page.goto('/off-the-clock/');
  const tally = page.getByRole('navigation', { name: 'On this page' });
  await expect(tally.getByRole('link')).toHaveCount(3);
  await tally.getByRole('link', { name: /LEGO sets built/ }).click();
  await expect(page).toHaveURL(/#lego$/);
  await expect(page.locator('#lego h2')).toBeInViewport();
  await tally.getByRole('link', { name: /leagues/ }).evaluate((link) => (link as HTMLAnchorElement).click());
  await expect(page.locator('#sports .pastime')).toHaveCount(4);
  await expect(page.locator('#sports h2')).toBeInViewport();
});

test('builds a real LEGO set in 3D when the viewer comes into view', async ({ page }) => {
  // Parsing a real LDraw model is heavy in headless browsers sharing one CPU.
  test.slow();
  const errors = collectErrors(page);
  await page.goto('/off-the-clock/');
  const viewer = page.locator('lego-viewer');
  await viewer.scrollIntoViewIfNeeded();
  await expect(viewer.locator('canvas')).toBeVisible({ timeout: 45_000 });
  await expect(viewer.locator('[data-progress]')).toHaveText(/^Step \d+ of \d+$/, { timeout: 45_000 });

  await viewer.getByRole('button', { name: /Ford Mustang/ }).click();
  await expect(viewer.locator('[data-credit]')).toContainText('10265');
  await expect(viewer.locator('[data-progress]')).toHaveText(/^Step \d+ of 23$/, { timeout: 45_000 });
  expect(errors).toEqual([]);
});

test('lists every project and gives each one a page', async ({ page }) => {
  await page.goto('/');
  const links = page.locator('.pcard__link');
  await expect(links).toHaveCount(7);
  await expect(page.getByText('This Is It 2.0')).toHaveCount(0);
  const hrefs = await links.evaluateAll((anchors) => anchors.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  for (const href of hrefs) {
    const response = await page.goto(href!);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.facts > div')).toHaveCount(4);
    await expect(page.getByRole('tab', { name: /Limits and next/ })).toBeVisible();
  }
});

test('reads a project one chapter at a time and moves between projects from anywhere', async ({ page }) => {
  await page.goto('/projects/matchday-ml/');
  const overview = page.locator('#overview');
  await expect(overview).toBeVisible();
  await expect(page.locator('#limits')).toBeHidden();

  await page.getByRole('tab', { name: /Limits and next/ }).click();
  await expect(page.locator('#limits')).toBeVisible();
  await expect(overview).toBeHidden();
  await expect(page).toHaveURL(/#limits$/);

  await page.getByRole('link', { name: 'Next: Built with' }).click();
  await expect(page.locator('#stack .tile').first()).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/projects\/reelrank\/$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/\/projects\/matchday-ml\/$/);
});

test('shows every project on the home page at once', async ({ page }) => {
  await page.goto('/#projects');
  const cards = page.locator('.pcard');
  await expect(cards).toHaveCount(7);
  for (const card of await cards.all()) await expect(card).toBeVisible();
});

test('unknown addresses get the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
});

for (const path of ['/', '/off-the-clock/', '/projects/linkify/', '/projects/hummle/']) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${path} has no serious accessibility problems in ${scheme} mode`, async ({ page }) => {
      test.slow(); // axe walks every node, which takes a while on the long pages when tests run in parallel.
      // Audit the settled page: mid-animation fades would read as low contrast.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(path);
      // Let the live parts finish drawing before auditing them.
      if (path === '/') await page.locator('page-trace .trace__row').first().waitFor();
      if (path === '/off-the-clock/') await page.locator('comic-shelf .spine:not([hidden])').first().waitFor();
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
