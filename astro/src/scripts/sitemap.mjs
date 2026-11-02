// Build hook: generate sitemap.xml at build end
// Attach via astro.config.mjs → hooks['astro:build:done']
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SITE = 'https://manningyangs.github.io';
const BASE = '/AI-Shovel-Collection';

function generateSitemap(outDir) {
  const urls = [
    { loc: `${SITE}${BASE}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE}${BASE}/trending/`, priority: '0.9', changefreq: 'daily' },
    { loc: `${SITE}${BASE}/submit.html`, priority: '0.6', changefreq: 'monthly' }
  ];

  // Add tool detail pages from catalog.csv
  try {
    const csvPath = path.join(outDir, 'catalog.csv');
    if (fs.existsSync(csvPath)) {
      const csv = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
      const rows = csv.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('分类'));
      rows.forEach(row => {
        const parts = row.split(',');
        const url = parts[2] || '';
        const slug = url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '').replace(/\//g, '-');
        if (slug) urls.push({ loc: `${SITE}${BASE}/tools/${slug}/`, priority: '0.7', changefreq: 'weekly' });
      });
    }
  } catch (e) { console.warn('sitemap tools:', e.message); }

  const lastmod = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), xml);
  console.log(`sitemap.xml: ${urls.length} URLs written`);
}

export default {
  name: 'generate-sitemap',
  hooks: {
    'astro:build:done'({ dir }) {
      // dir may be URL object or string across Astro versions; use fileURLToPath for safety
      const outDir = typeof dir === 'string' ? dir : fileURLToPath(dir);
      generateSitemap(outDir);
    }
  }
};
