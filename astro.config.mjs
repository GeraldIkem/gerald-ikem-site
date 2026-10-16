import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_URL overrides this, e.g. for a preview deploy on another address.
const site = process.env.SITE_URL ?? 'https://geraldikem.com';

export default defineConfig({
  site,
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  devToolbar: { enabled: false },
});
