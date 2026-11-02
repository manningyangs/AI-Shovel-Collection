// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // GitHub Project Pages: site = user repo, base = project name
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
  }
});
