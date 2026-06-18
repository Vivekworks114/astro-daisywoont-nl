#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.resolve(ROOT, 'public/images');
const PRODUCTS_FILE = path.resolve(ROOT, 'src/data/product-pages-from-wp.json');

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'AstroMigration/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, data }));
      })
      .on('error', reject)
      .setTimeout(45000, function () {
        this.destroy(new Error(`Timeout: ${url}`));
      });
  });
}

function basenameFromUrl(url) {
  try {
    return decodeURIComponent(path.basename(new URL(url).pathname));
  } catch {
    return path.basename(url);
  }
}

function stripSizeSuffix(filename) {
  return filename.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
}

function localImagePath(url) {
  return `/images/${stripSizeSuffix(basenameFromUrl(url))}`;
}

function replaceMediaUrls(html) {
  return html
    .replace(/https?:\/\/daisywoont\.nl\/wp-content\/uploads\/[^"'\s)>]+/gi, (url) => localImagePath(url))
    .replace(/https?:\/\/www\.daisywoont\.nl\/wp-content\/uploads\/[^"'\s)>]+/gi, (url) => localImagePath(url));
}

function extractTitle(html) {
  const raw = html.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
  return raw.split('|')[0].trim();
}

function extractContent(html) {
  const pageIdx = html.search(/<div[^>]*data-elementor-type="wp-page"/);
  if (pageIdx === -1) return null;
  const footerIdx = html.search(/data-elementor-type="footer"/);
  const footerTagIdx = html.indexOf('<footer', pageIdx);
  let end = html.length;
  if (footerIdx > pageIdx) end = Math.min(end, footerIdx);
  if (footerTagIdx > pageIdx) end = Math.min(end, footerTagIdx);
  const bodyEnd = html.indexOf('</body>', pageIdx);
  if (bodyEnd > pageIdx) end = Math.min(end, bodyEnd);
  if (end <= pageIdx) return null;
  return html.slice(pageIdx, end).trim();
}

function collectImageUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/https?:\/\/daisywoont\.nl\/wp-content\/uploads\/[^"'\s)>]+/gi)) {
    urls.add(match[0]);
  }
  return [...urls];
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      resolve(false);
      return;
    }
    https
      .get(url, { headers: { 'User-Agent': 'AstroMigration/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(true);
        });
      })
      .on('error', reject);
  });
}

async function getSitemapSlugs() {
  const index = await get('https://daisywoont.nl/sitemap_index.xml');
  const maps = [...index.data.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const slugs = new Set();
  for (const mapUrl of maps) {
    const xml = await get(mapUrl);
    for (const match of xml.data.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = match[1];
      if (loc.includes('/beste-')) {
        const slug = loc.replace('https://daisywoont.nl/', '').replace(/\/$/, '');
        slugs.add(slug);
      }
    }
  }
  return [...slugs].sort();
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const existing = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  const existingSlugs = new Set(existing.map((p) => p.slug));
  const sitemapSlugs = await getSitemapSlugs();
  const missing = sitemapSlugs.filter((s) => !existingSlugs.has(s));

  console.log(`Sitemap products: ${sitemapSlugs.length}`);
  console.log(`Existing: ${existingSlugs.size}`);
  console.log(`Fetching ${missing.length} missing pages...`);

  const imageUrls = new Set();
  const added = [];
  const failed = [];

  for (let i = 0; i < missing.length; i++) {
    const slug = missing[i];
    const url = `https://daisywoont.nl/${slug}/`;
    process.stdout.write(`[${i + 1}/${missing.length}] ${slug}... `);
    try {
      const { status, data } = await get(url);
      if (status !== 200) throw new Error(`HTTP ${status}`);
      const content = extractContent(data);
      if (!content) throw new Error('No main content found');
      const title = extractTitle(data) || slug;
      const processed = replaceMediaUrls(content);
      collectImageUrls(data).forEach((u) => imageUrls.add(u));
      added.push({ slug, title, content: processed });
      console.log('ok');
    } catch (err) {
      failed.push({ slug, error: err.message });
      console.log(`FAIL (${err.message})`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDownloading ${imageUrls.size} images...`);
  let downloaded = 0;
  let skipped = 0;
  let imgFailed = 0;
  for (const url of imageUrls) {
    const filename = stripSizeSuffix(basenameFromUrl(url));
    const dest = path.join(IMAGES_DIR, filename);
    try {
      const wasNew = await downloadFile(url, dest);
      if (wasNew) downloaded++;
      else skipped++;
    } catch {
      imgFailed++;
    }
  }
  console.log(`Images: ${downloaded} new, ${skipped} skipped, ${imgFailed} failed`);

  const merged = [...existing, ...added].sort((a, b) => a.slug.localeCompare(b.slug));
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Wrote ${merged.length} product pages (${added.length} added)`);
  if (failed.length) {
    console.log('Failed slugs:', failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
