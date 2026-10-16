// Renders the social card and the home-screen icon with the installed Edge.
// Run after changing scripts/og.html or the logo: node scripts/render-images.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });

const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await card.goto(pathToFileURL(path.join(root, 'scripts', 'og.html')).href);
await card.evaluate(() => document.fonts.ready);
await card.screenshot({ path: path.join(root, 'public', 'og.png') });

const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
await icon.setContent(`
  <body style="margin:0;background:#f3f4f0">
    <svg viewBox="0 0 32 32" width="180" height="180">
      <rect x="5" y="7.5" width="22" height="4" rx="1" fill="#1d2024"/>
      <rect x="9" y="14" width="9" height="4" rx="1" fill="#0083b5"/>
      <rect x="16" y="20.5" width="11" height="4" rx="1" fill="#c2006a"/>
    </svg>
  </body>`);
await icon.screenshot({ path: path.join(root, 'public', 'apple-touch-icon.png') });

await browser.close();
console.log('Wrote public/og.png and public/apple-touch-icon.png');
