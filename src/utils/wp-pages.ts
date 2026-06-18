import pagesFromWp from '../data/pages-from-wp.json';
import productPagesFromWp from '../data/product-pages-from-wp.json';

const SKIP_SLUGS = new Set(['home', 'blogs', 'sitemap', 'top-10-zb_mp_mv']);

export type WpPage = { slug: string; title: string; content: string };

export function getAllWpPages(): WpPage[] {
  return [
    ...pagesFromWp.filter((p) => !SKIP_SLUGS.has(p.slug)),
    ...productPagesFromWp,
  ];
}
