// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemapPlugin from './src/scripts/sitemap.mjs';

// https://astro.build/config
export default defineConfig({
  // GitHub Project Pages
  site: 'https://manningyangs.github.io',
  base: '/AI-Shovel-Collection',
  output: 'static',
  build: {
    format: 'directory'
  },
  // Dev server also needs the base path
  server: {
    base: '/AI-Shovel-Collection',
    port: 4321
  },
  // React 仅用于 Tool Map（client:only 水合），不影响其他页面
  // Custom sitemap hook (replaces @astrojs/sitemap which had v3 compat issues)
  integrations: [react(), sitemapPlugin]
});
