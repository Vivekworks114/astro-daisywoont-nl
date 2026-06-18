import pagesFromWp from '../data/pages-from-wp.json';
import productPagesFromWp from '../data/product-pages-from-wp.json';
import { cleanWpHtml } from './wp-content';

const SKIP_SLUGS = new Set(['home', 'blogs', 'sitemap', 'top-10-zb_mp_mv']);

export type WpPage = { slug: string; title: string; content: string };

function mapPages(pages: typeof pagesFromWp): WpPage[] {
  return pages.map((page) => ({
    ...page,
    content: cleanWpHtml(page.content),
  }));
}

export function getAllWpPages(): WpPage[] {
  return [
    ...mapPages(pagesFromWp.filter((p) => !SKIP_SLUGS.has(p.slug))),
    ...mapPages(productPagesFromWp),
  ];
}
