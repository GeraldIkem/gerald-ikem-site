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

## Credits

- 3D LEGO models from the [LDraw.org Official Model Repository](https://library.ldraw.org/omr): 10262 and 76139 by Orion Pobursky, 10265 by Ulrich Röder, all CC BY 2.0. Parts from the [LDraw.org Parts Library](https://library.ldraw.org), CC BY 2.0 and 4.0; each packed file keeps every part's author and licence lines.
- Comic covers, spines and back covers belong to their publishers and are shown only to picture books in my collection.
- LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this site. LDraw™ is a trademark of the Estate of James Jessiman.
