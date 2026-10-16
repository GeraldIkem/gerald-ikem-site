import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Set SITE_URL in the deploy environment once the domain is final.
const site = process.env.SITE_URL ?? 'https://geraldikem.github.io';

export default defineConfig({
  site,
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  devToolbar: { enabled: false },
});
