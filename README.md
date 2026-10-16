# gerald-ikem-site

My personal site and résumé. A static site built with Astro and TypeScript, with hand-written CSS and no UI framework in the browser.

The site treats my work the way I see a backend system: as requests moving through services. One visual idea, the trace span, runs through it.

- **The hero** draws a trace of your own request for the page, from the Navigation Timing and Resource Timing entries your browser records. The numbers are real and change on every load.
- **The career timeline** is the same kind of trace: roles and degrees as spans, overlapping where they overlapped.
- **Try paying twice** is a small model of the duplicate-reference check I added to a checkout service. Press Pay twice and the second request is refused.
- **How Linkify resolves a short link** walks through the redirect path (cache hit, unknown code, expired link, Redis down). It works without JavaScript: it is a radio group and CSS `:has()`.
- **The comic shelf** on `/off-the-clock/` is my actual collection, exported from CLZ Comics. Every spine opens my note on that book.

## Stack

| Part | What and why |
| --- | --- |
| Astro 7 | Static output, content collections with a Zod schema for the comics, image optimisation to WebP. |
| TypeScript | Strict mode. The logic behind each interactive part lives in `src/lib/` as plain functions with unit tests. |
| Web Components | The interactive parts are custom elements (`<page-trace>`, `<pay-demo>`, `<comic-shelf>`), so no framework runtime ships. |
| CSS | Custom properties for the light and dark themes, a responsive layout down to phone width, and a print stylesheet that turns the home page into a plain résumé. |
| Python | `scripts/import_comics.py` turns the CLZ XML export into `src/data/comics.json`. |
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
| `node scripts/render-images.mjs` | Re-render the social card and home-screen icon |

## Updating content

- Roles, dates and skills: `src/data/career.ts`
- Projects: `src/data/projects.ts`
- Name, email, links, résumé path: `src/data/site.ts`
- Résumé PDF: `public/resume/Gerald_Ikem_Resume.pdf`
- Comics: export from CLZ Comics (File, Export, XML), then `npm run comics -- path/to/export.xml`
