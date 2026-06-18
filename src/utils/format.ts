export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function normalizeNavHref(href: string): string {
  if (!href) return '/';
  if (href.startsWith('https://daisywoont.nl/')) {
    const path = href.replace('https://daisywoont.nl', '');
    return path.endsWith('/') ? path : `${path}/`;
  }
  return href;
}
