import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

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
      await expect(story.locator('.chip', { hasText: 'Spring Boot' })).toBeVisible();
      return;
    }
    await expect(story).toHaveClass(/is-live/);
    const springBoot = story.locator('.chip', { hasText: 'Spring Boot' });
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

  test('shows the real spine where there is a photo of it, and still names the book', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/off-the-clock/');
    const photographed = page.locator('.spine:not([hidden]):has(.spine__photo)');
    test.skip((await photographed.count()) === 0, 'No spine photos yet');
    const spine = photographed.first();
    const title = (await spine.getAttribute('data-title')) ?? '';
    await expect(spine).toHaveAccessibleName(`${title}. ${await spine.getAttribute('data-state')}.`);
    const image = spine.locator('.spine__photo');
    await expect(image).toHaveAttribute('alt', '');
    await spine.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('puts the real back cover on the 3D book', async ({ page }) => {
    const backs: string[] = [];
    page.on('response', (response) => {
      if (response.ok() && response.url().includes('/backs/')) backs.push(new URL(response.url()).pathname);
    });
    await page.goto('/off-the-clock/');
    const withBack = page.locator('.spine:not([hidden])[data-back-image^="/backs/"]');
    test.skip((await withBack.count()) === 0, 'No back covers yet');
    await expect(page.locator('.shelf__stage canvas')).toBeVisible({ timeout: 15_000 });
    const spine = withBack.last();
    await spine.click();
    await expect.poll(() => backs).toContain(await spine.getAttribute('data-back-image'));
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
  // This is about the links, not the 3D: keep the LEGO model and the 3D book from loading, since parsing
  // them without a GPU ties up the page for longer than a jump should take.
  await page.route('**/lego/*.mpd.gz', (route) => route.abort());
  await page.route(/\/_astro\/(book3d|legoBuild)\.[^/]*\.js$/, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
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

test.describe('sports you can play', () => {
  const card = (page: Page, game: string) => page.locator(`[data-game="${game}"]`);
  // A shot plays out in real time, which takes longer when the browsers share a busy CPU.
  const inPlay = { timeout: 15_000 };

  /** Bring a card into view and let its drawing finish playing by itself, so the ball is ours. */
  async function settled(page: Page, game: string) {
    const stage = card(page, game).locator('.pastime__stage');
    await stage.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(300);
    await expect(stage).not.toHaveClass(/is-busy/, inPlay);
    return stage;
  }

  // The keyboard tests ask for reduced motion, so a shot lands the moment it's taken whatever the frame rate;
  // the mouse and touch tests below watch it fly.
  test('scores a basket from the keyboard', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/off-the-clock/');
    const court = card(page, 'court');
    const stage = court.getByRole('application', { name: /Basketball/ });
    await stage.focus();
    await expect(stage).toBeFocused();
    // The starting aim is a touch long; three presses down bring it in.
    for (let i = 0; i < 3; i++) await stage.press('ArrowDown');
    await stage.press('Space');
    await expect(court.locator('[data-live]')).toHaveText('2 points. Score 2.', inPlay);
    await expect(court.locator('[data-score]')).toHaveText('2');
    await expect(court.locator('[data-streak]')).toHaveText('1');
    expect(errors).toEqual([]);
  });

  test('scores a goal from the keyboard, and a kick out of play comes back', async ({ page }) => {
    test.slow(); // Two kicks and forty key presses.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/off-the-clock/');
    const pitch = card(page, 'pitch');
    const stage = pitch.getByRole('application', { name: /Football/ });
    await stage.focus();
    // Straight at the keeper is saved; six presses up put it past him.
    for (let i = 0; i < 6; i++) await stage.press('ArrowUp');
    await stage.press('Space');
    await expect(pitch.locator('[data-live]')).toHaveText('Goal! 1 of 1.', inPlay);
    await expect(pitch.locator('[data-goals]')).toHaveText('1');

    // Then a hard kick up the pitch, out over the touchline.
    await expect(stage).not.toHaveClass(/is-busy/, inPlay);
    const ball = pitch.locator('[data-ball]');
    const spot = await ball.getAttribute('transform');
    // Shift moves the aim in bigger steps.
    for (let i = 0; i < 14; i++) await stage.press('Shift+ArrowLeft');
    for (let i = 0; i < 17; i++) await stage.press('Shift+ArrowUp');
    await stage.press('Enter');
    await expect(pitch.locator('[data-live]')).toHaveText('Out of play. 1 of 2.', inPlay);
    await expect(stage).not.toHaveClass(/is-busy/, inPlay);
    await expect(ball).toHaveAttribute('transform', spot ?? '');
  });

  test('scores a basket with a mouse drag from the ball', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones drag by touch, tested below.');
    test.slow(); // Waits for the drawing to finish playing by itself first.
    await page.goto('/off-the-clock/');
    const court = card(page, 'court');
    await settled(page, 'court');
    const box = (await court.locator('svg').boundingBox())!;
    const scale = box.width / 320;
    const x = box.x + 168 * scale;
    const y = box.y + 123 * scale;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 44 * scale, y - 64 * scale, { steps: 8 });
    await expect(court.locator('[data-aim]')).toHaveClass(/is-on/);
    await page.mouse.up();
    await expect(court.locator('[data-live]')).toHaveText('2 points. Score 2.', inPlay);
  });

  test('a touch drag on the ball shoots, and a swipe anywhere else still scrolls the page', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Touch only.');
    test.slow(); // Waits for the drawing to finish playing by itself first.
    await page.goto('/off-the-clock/');
    const court = card(page, 'court');
    await settled(page, 'court');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const box = (await court.locator('svg').boundingBox())!;
    const scale = box.width / 320;
    const x = box.x + 168 * scale;
    const y = box.y + 123 * scale;

    const before = await page.evaluate(() => scrollY);
    await touch('touchStart', x, y);
    for (let i = 1; i <= 8; i++) await touch('touchMove', x - (44 * scale * i) / 8, y - (64 * scale * i) / 8);
    await touch('touchEnd');
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await expect(court.locator('[data-live]')).toHaveText('2 points. Score 2.', inPlay);

    // Away from the ball, the drawing is just part of the page.
    const wall = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5 };
    await touch('touchStart', wall.x, wall.y);
    for (let i = 1; i <= 10; i++) await touch('touchMove', wall.x, wall.y - 20 * i);
    await touch('touchEnd');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
  });

  test('swims a length with the arrow keys and keeps the best time', async ({ page }) => {
    test.slow();
    await page.goto('/off-the-clock/');
    const pool = card(page, 'pool');
    const stage = pool.getByRole('application', { name: /Swimming/ });
    await stage.focus();
    const live = pool.locator('[data-live]');
    // Start with real key presses.
    await stage.press('ArrowLeft');
    await stage.press('ArrowLeft');
    await stage.press('ArrowRight');
    // Then left, right, left, right at a steady 8 a second, kept up inside the page so the pace holds on a busy machine.
    await stage.evaluate(
      (el) =>
        new Promise<void>((resolve) => {
          let i = 0;
          const timer = setInterval(() => {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: i++ % 2 ? 'ArrowRight' : 'ArrowLeft', bubbles: true }));
            const said = el.closest('.pastime')?.querySelector('[data-live]')?.textContent ?? '';
            if (said.startsWith('Finished') || i > 600) {
              clearInterval(timer);
              resolve();
            }
          }, 125);
        }),
    );
    await expect(live).toHaveText(/^Finished in \d+\.\d\d seconds\. New best\.$/);
    const best = await pool.locator('[data-best]').textContent();
    expect(best).toMatch(/^\d+\.\d\d$/);

    await page.reload();
    await expect(card(page, 'pool').locator('[data-best]')).toHaveText(best ?? '');
  });

  test('swims on taps of the two pads', async ({ page }) => {
    await page.goto('/off-the-clock/');
    const pool = card(page, 'pool');
    const swimmer = pool.locator('[data-swimmer]');
    const start = await swimmer.getAttribute('transform');
    await pool.getByRole('button', { name: 'Left arm' }).click();
    await pool.getByRole('button', { name: 'Right arm' }).click();
    await expect(swimmer).not.toHaveAttribute('transform', start ?? '', inPlay);
    await expect(pool.locator('[data-time]')).not.toHaveText('0.00', inPlay);
  });

  test('pulls a book off the shelf by pointer and by keyboard', async ({ page }) => {
    await page.goto('/off-the-clock/');
    const books = card(page, 'books');
    await settled(page, 'books');
    const spines = books.locator('[data-book]');
    await spines.nth(1).click();
    await expect(spines.nth(1)).toHaveClass(/is-out/);
    await expect(books.locator('[data-live]')).toHaveText('Pulled out book 2 of 8.');

    await books.getByRole('application', { name: 'Bookshelf' }).press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(spines.nth(2)).toHaveClass(/is-out/);
    await expect(spines.nth(1)).not.toHaveClass(/is-out/);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`stays accessible mid-game in ${scheme} mode`, async ({ page }) => {
      test.slow(); // axe walks the whole section, as in the page audits below.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/off-the-clock/');
      const court = card(page, 'court');
      const stage = court.getByRole('application', { name: /Basketball/ });
      await stage.focus();
      await stage.press('ArrowDown');
      await expect(court.locator('[data-aim]')).toHaveClass(/is-on/);
      // With reduced motion the shot lands at once, with no flight to watch.
      await stage.press('Space');
      await expect(court.locator('[data-live]')).not.toBeEmpty(inPlay);
      const results = await new AxeBuilder({ page })
        .include('#sports')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
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

  // While it builds, the play button pauses it; at the end of the steps it offers to build it again.
  const play = viewer.getByRole('button', { name: 'Pause' });
  await expect(play).toBeVisible();
  await viewer.getByRole('slider', { name: 'Step' }).press('End');
  await expect(viewer.locator('[data-progress]')).toHaveText('Step 23 of 23');
  await expect(viewer.getByRole('button', { name: 'Build it again' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('plays a LEGO build like a video: pause, a step back or forward, any step, and faster', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await page.goto('/off-the-clock/');
  const viewer = page.locator('lego-viewer');
  await viewer.scrollIntoViewIfNeeded();
  await viewer.getByRole('button', { name: /Ford Mustang/ }).click();
  const progress = viewer.locator('[data-progress]');
  await expect(progress).toHaveText(/^Step \d+ of 23$/, { timeout: 45_000 });

  // Paused, it stays on its step.
  await viewer.getByRole('button', { name: 'Pause' }).click();
  await expect(viewer.getByRole('button', { name: 'Play' })).toBeVisible();
  const paused = await progress.textContent();
  await page.waitForTimeout(1_000);
  await expect(progress).toHaveText(paused!);

  // Any step at once from the slider, then one at a time back and forward, with the pieces moving.
  const steps = viewer.getByRole('slider', { name: 'Step' });
  await steps.fill('12');
  await expect(progress).toHaveText('Step 12 of 23');
  await viewer.getByRole('button', { name: 'Back a step' }).click();
  await expect(progress).toHaveText('Step 11 of 23', { timeout: 15_000 });
  await viewer.getByRole('button', { name: 'Back a step' }).click();
  await expect(progress).toHaveText('Step 10 of 23', { timeout: 15_000 });
  await viewer.getByRole('button', { name: 'Forward a step' }).click();
  await expect(progress).toHaveText('Step 11 of 23', { timeout: 15_000 });
  await expect(steps).toHaveValue('11');
  await steps.fill('0');
  await expect(progress).toHaveText('Step 0 of 23');
  await expect(viewer.getByRole('button', { name: 'Back a step' })).toBeDisabled();

  // 1× is the standard speed; the choice is remembered.
  const speed = viewer.getByRole('group', { name: 'Speed' });
  await expect(speed.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
  await speed.getByRole('button', { name: '4×' }).click();
  await expect(speed.getByRole('button', { name: '4×' })).toHaveAttribute('aria-pressed', 'true');
  await expect(speed.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false');
  await viewer.getByRole('button', { name: 'Play' }).click();
  await expect(progress).toHaveText('Step 23 of 23', { timeout: 30_000 });
  await expect(viewer.getByRole('button', { name: 'Build it again' })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Forward a step' })).toBeDisabled();

  await page.reload();
  await expect(page.locator('lego-viewer [data-speed="4"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('builds my own model of the Astro Bot step by step, and credits me', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await page.goto('/off-the-clock/');
  const viewer = page.locator('lego-viewer');
  await viewer.scrollIntoViewIfNeeded();
  await expect(viewer.locator('canvas')).toBeVisible({ timeout: 45_000 });

  await viewer.getByRole('button', { name: /Astro Bot/ }).click();
  await expect(viewer.locator('[data-credit]')).toHaveText(
    '3D model of set 40899 by Gerald Ikem, modelled step by step from the LEGO building instructions, CC BY 4.0.',
  );
  // 95 steps in the booklet; a sub-build made twice in one step plays once per copy, and a step that only attaches
  // a sub-build adds no new parts of its own.
  await expect(viewer.locator('[data-progress]')).toHaveText(/^Step \d+ of 89$/, { timeout: 45_000 });
  await expect(viewer.locator('[data-progress]')).toHaveText('Step 89 of 89', { timeout: 45_000 });
  expect(errors).toEqual([]);
});

/** A one-unit blue box as binary glTF, standing in for a scan file. */
function boxGlb(): Buffer {
  const positions = new Float32Array(Array.from({ length: 8 }, (_, i) => [i & 1, (i >> 1) & 1, (i >> 2) & 1]).flat());
  const indices = new Uint16Array([
    0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6,
  ]);
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
  };
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const chunk = (data: Buffer, type: number) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk(text, 0x4e4f534a), chunk(bin, 0x004e4942)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

test('shows a scan of my own build whole, and says it is a scan', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  // No set has a scan yet, so put a scan button first in the picker and serve a box as its file.
  const credit = 'A 3D scan of my own build of set 21356, made with a test.';
  await page.route('**/off-the-clock/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /(aria-label="Choose a set to build"[^>]*>)/,
      `$1<button type="button" class="viewer__pick" aria-pressed="false" data-url="/lego/test-scan.glb" data-kind="scan" data-name="River Steamboat" data-model-credit="${credit}" data-built="true">River Steamboat</button>`,
    );
    await route.fulfill({ response, body: html });
  });
  await page.route('**/lego/test-scan.glb', (route) =>
    route.fulfill({ body: boxGlb(), contentType: 'model/gltf-binary' }),
  );

  await page.goto('/off-the-clock/');
  const viewer = page.locator('lego-viewer');
  await viewer.scrollIntoViewIfNeeded();
  await expect(viewer.locator('[data-credit]')).toHaveText(credit);
  await expect(viewer.locator('[data-progress]')).toHaveText('Scan of my own build', { timeout: 45_000 });
  // A scan has no steps to move between, so only play and speed show.
  await expect(viewer.getByRole('button', { name: 'Back a step' })).toBeHidden();
  await expect(viewer.getByRole('slider', { name: 'Step' })).toBeHidden();
  await expect(viewer.getByRole('button', { name: 'Show it again' })).toBeVisible({ timeout: 15_000 });

  // Once it has risen into view, the box is on screen in its own colour, unlit as photographed.
  const shot = await viewer.locator('[data-stage]').screenshot();
  const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let blue = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i]! < 40 && data[i + 1]! < 40 && data[i + 2]! > 215) blue++;
  expect(blue).toBeGreaterThan(2000);

  // An LDraw set still builds step by step after a scan.
  await viewer.getByRole('button', { name: /Ford Mustang/ }).click();
  await expect(viewer.locator('[data-progress]')).toHaveText(/^Step \d+ of 23$/, { timeout: 45_000 });
  await expect(viewer.getByRole('button', { name: 'Back a step' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('every LEGO set shows its photo, and a 3D brick builds that set', async ({ page }) => {
  // The photos load lazily and the 3D viewer loads alongside them, which is slow when the browsers share a busy CPU.
  test.slow();
  await page.goto('/off-the-clock/');
  const photos = page.locator('.brick__photo img');
  await expect(photos).toHaveCount(11);
  await photos.last().scrollIntoViewIfNeeded();
  await expect
    .poll(() => photos.evaluateAll((imgs) => imgs.filter((img) => (img as HTMLImageElement).naturalWidth > 0).length), {
      timeout: 20_000,
    })
    .toBe(11);
  await page.getByRole('button', { name: 'Build the Ford Mustang in 3D' }).click();
  await expect(page.locator('lego-viewer [data-credit]')).toContainText('10265', { timeout: 20_000 });
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

test('shares each project with its own screenshot, and the home page with the site card', async ({ page, request }) => {
  await page.goto('/projects/linkify/');
  const image = page.locator('meta[property="og:image"]');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  await expect(image).toHaveAttribute('content', /^https:\/\/.+\/_astro\/linkify\..+\.jpg$/);
  // The card is published at the same path the absolute URL names.
  const card = await request.get(new URL(await image.getAttribute('content') ?? '').pathname);
  expect(card.status()).toBe(200);
  expect(card.headers()['content-type']).toContain('image/jpeg');

  await page.goto('/');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'profile');
  await expect(image).toHaveAttribute('content', /\/og\.png$/);
});

test('styles kept in their own files still reach the markup they were written for', async ({ page }) => {
  // src/styles/case.css, imported by the project page.
  await page.goto('/projects/linkify/');
  await expect(page.locator('.case__band')).toHaveCSS('background-color', 'rgb(75, 47, 230)');
  await expect(page.locator('.facts > div').first()).toHaveCSS('border-top-width', '3px');

  // The shared card, score and ball styles, imported by each card in src/components/pastimes/.
  await page.goto('/off-the-clock/');
  await expect(page.locator('.pastimes')).toHaveCSS('display', 'grid');
  for (const game of ['court', 'pitch', 'pool', 'books']) {
    await expect(page.locator(`[data-game="${game}"]`)).toHaveCSS('border-radius', '10px');
  }
  for (const game of ['court', 'pitch', 'pool']) {
    await expect(page.locator(`[data-game="${game}"] .bug`)).toHaveCSS('position', 'absolute');
  }
  await expect(page.locator('[data-game="court"] .hit')).toHaveCSS('cursor', 'grab');
  await expect(page.locator('[data-game="pool"] .pad').first()).toHaveCSS('border-radius', '999px');
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
