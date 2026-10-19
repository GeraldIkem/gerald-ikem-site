# gerald-ikem-site

The code behind [geraldikem.com](https://geraldikem.com), my personal site and résumé. A static site built with Astro and TypeScript, with hand-written CSS and no UI framework in the browser.

## Stack

| Part | What and why |
| --- | --- |
| Astro 7 | Static output, content collections with a Zod schema, image optimisation to WebP. |
| TypeScript | Strict mode. The logic behind each interactive part lives in `src/lib/` as plain functions with unit tests. |
| Web Components | The interactive parts are custom elements, so no framework runtime ships. |
| CSS | Custom properties for the light and dark themes, a responsive layout down to phone width, and a print stylesheet that turns the home page into a plain résumé. |
| three.js | The 3D comic books and the LEGO builds, loaded only when they scroll near. |
| Vitest, Playwright, axe | Unit tests for the logic, and browser tests for every page on desktop and phone sizes, including an accessibility audit in both themes. |

## Running it

You need Node 22.12 or newer. Then:

```sh
npm ci
npm run dev
```

The end-to-end tests drive the installed Microsoft Edge locally and Playwright's Chromium in CI. To use Chromium locally instead, run `npx playwright install chromium` once and set `CI=1`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the dev server with live reload. |
| `npm run build` | Builds the static site into `dist/`. `SITE_URL` sets the address used in canonical links, the sitemap and social cards (default `https://geraldikem.com`). |
| `npm run preview` | Serves the built `dist/`. |
| `npm run check` | Type-checks the Astro components and TypeScript. |
| `npm test` | Runs the Vitest unit tests in `tests/unit/`. |
| `npm run test:e2e` | Runs the Playwright tests in `tests/e2e/`, including the axe accessibility audit, against `astro preview` on port 4322 (`PREVIEW_PORT` changes it). Run `npm run build` first. |
| `npm run comics` | Shorthand for `python scripts/import_comics.py`; pass the export after `--`. |

Every push runs the type-check, unit tests, build and browser tests. On `main`, the build those tests ran against is then published to GitHub Pages, so nothing goes live unless all of them pass.

## Asset scripts

These update the data and images the site is built from. None of them run as part of the build; run each from the repository root and commit what it writes.

**Comics** (in this order when the collection changes):

1. `python scripts/import_comics.py path/to/export.xml [out.json]` turns a CLZ Comics XML export (File > Export > XML) into `src/data/comics.json`. It keeps each book's cover, spine and back fields from the previous file, so re-importing never loses the images. Needs only Python 3 and its standard library.
2. `node scripts/covers.mjs [--from <folder>] [--force]` downloads each book's front cover from CLZ to `public/covers/<id>.webp`, and the back cover to `public/backs/` when the export has one, and records the cover's colour and proportions in `comics.json`. Books that already have a cover are skipped unless you pass `--force`; `--from` reads already-downloaded covers named `<id>.img` first. A front cover replaced by a photo is never overwritten.
3. `node scripts/spines.mjs [folder]` turns photos named `<id>-spine.jpg`, `<id>-back.jpg` or `<id>-front.jpg` (default folder: `photos/`, which is not committed) into `public/spines/` and `public/backs/` images, straightening, cropping and colour-matching each one. `--missing` lists the books still without a spine or back, `--dry-run` writes to `<folder>/out/` without touching the site, `--debug` saves the outline it found, and `--scan` skips detection for flat scans. The comment at the top of the script covers `fixes.json` for photos it gets wrong.

**LEGO:** `node scripts/pack-ldraw.mjs <ldraw library folder> <model.mpd> <out.mpd.gz>` packs a model and every part it uses into one gzipped file for the viewer, such as `public/lego/10262.mpd.gz`. The library is the official LDraw parts library (`complete.zip` from library.ldraw.org).

**Social card and icon:** `scripts/og.html` is the 1200 × 630 card shared for the home page. After changing it or the logo, run `node scripts/render-images.mjs` to write `public/og.png` and `public/apple-touch-icon.png`. It renders with the installed Edge; set `PW_CHANNEL=chromium` to use Playwright's Chromium instead. Project pages share their own screenshot, cropped at build time.

## Credits

- 3D LEGO models from the [LDraw.org Official Model Repository](https://library.ldraw.org/omr): 10262 and 76139 by Orion Pobursky, 10265 by Ulrich Röder, all CC BY 2.0. Parts from the [LDraw.org Parts Library](https://library.ldraw.org), CC BY 2.0 and 4.0; each packed file keeps every part's author and licence lines.
- Comic covers, spines and back covers belong to their publishers and are shown only to picture books in my collection.
- LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this site. LDraw™ is a trademark of the Estate of James Jessiman.
