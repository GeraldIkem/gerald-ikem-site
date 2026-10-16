# gerald-ikem-site

My personal site and résumé. A static site built with Astro and TypeScript, with hand-written CSS and no UI framework in the browser.

The site treats my work the way I see a backend system: as requests moving through services. One visual idea, the trace span, runs through it.

- **The hero** draws a trace of your own request for the page, from the Navigation Timing and Resource Timing entries your browser records. The numbers are real and change on every load.
- **The career timeline** is the same kind of trace: roles and degrees as spans, overlapping where they overlapped.
- **Try paying twice** is a small model of the duplicate-reference check I added to a checkout service. Press Pay twice and the second request is refused.
- **How Linkify resolves a short link** walks through the redirect path (cache hit, unknown code, expired link, Redis down). It works without JavaScript: it is a radio group and CSS `:has()`.
- **LEGO in 3D**: the sets that have an exact digital model (the James Bond Aston Martin DB5, the Ford Mustang and the 1989 Batmobile) build themselves on screen in the order of their real instructions, piece by piece, with three.js.
- **The comic shelf** on `/off-the-clock/` is my actual collection, exported from CLZ Comics. Pick a spine and the book comes off the shelf in 3D, turning from spine to cover, with my note on it. The covers are original designs, not publisher art.

## Stack

| Part | What and why |
| --- | --- |
| Astro 7 | Static output, content collections with a Zod schema for the comics, image optimisation to WebP. |
| TypeScript | Strict mode. The logic behind each interactive part lives in `src/lib/` as plain functions with unit tests. |
| Web Components | The interactive parts are custom elements (`<page-trace>`, `<pay-demo>`, `<comic-shelf>`), so no framework runtime ships. |
| CSS | Process-ink colour bands, halftone dots and a misregistered print effect on the headings; custom properties for the light and dark themes, a responsive layout down to phone width, and a print stylesheet that turns the home page into a plain résumé. |
| Python | `scripts/import_comics.py` turns the CLZ XML export into `src/data/comics.json`. |
| three.js | Loaded only when the LEGO section scrolls near, to render LDraw models and animate the build. A Node script packs each model with its parts so no parts library is needed at runtime. |
| Vitest, Playwright, axe | Unit tests for the logic; browser tests for each page on desktop and phone sizes, including an accessibility audit in both themes. |

Fonts are Familjen Grotesk and Atkinson Hyperlegible Mono, self-hosted through Fontsource. No cookies, analytics or third-party requests.

## Run it

Needs Node 22.12 or later.

```bash
npm install
npm run dev
```

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Static site into `dist/` |
| `npm run preview` | Serve `dist/` |
| `npm run check` | Type-check `.astro` and `.ts` files |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser and accessibility tests (build first) |
| `npm run comics -- <export.xml>` | Refresh the shelf from a CLZ export |
| `node scripts/covers.mjs` | Fetch the covers listed in the comic data, save WebPs to `public/covers/`, record spine colours |
| `node scripts/pack-ldraw.mjs <ldraw> <model.mpd> <out.mpd.gz>` | Pack an LDraw model with its parts into one file for the 3D viewer |
| `node scripts/render-images.mjs` | Re-render the social card and home-screen icon |

## Updating content

- Roles, dates and skills: `src/data/career.ts`
- Projects: `src/data/projects.ts`
- Name, email, links, résumé path: `src/data/site.ts`
- Résumé PDF: `public/resume/Gerald_Ikem_Resume.pdf`
- Comics: export from CLZ Comics (File, Export, XML), then `npm run comics -- path/to/export.xml`

## Credits

- 3D LEGO models from the [LDraw.org Official Model Repository](https://library.ldraw.org/omr): 10262 and 76139 by Orion Pobursky, 10265 by Ulrich Röder, all CC BY 2.0. Parts from the [LDraw.org Parts Library](https://library.ldraw.org), CC BY 2.0 and 4.0; each packed file keeps every part's author and licence lines.
- Comic covers belong to their publishers and are shown only to picture books in my collection.
- LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this site. LDraw™ is a trademark of the Estate of James Jessiman.
