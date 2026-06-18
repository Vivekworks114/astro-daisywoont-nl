export function localImagePathFromUpload(urlPath: string): string {
  const filename = urlPath.split('/').pop() || '';
  const elementorMatch = filename.match(/^(.+)-[a-z0-9]{20,}(\.[a-z0-9]+)$/i);
  const base = elementorMatch ? `${elementorMatch[1]}${elementorMatch[2]}` : filename.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
  return `/images/${base}`;
}

export function cleanWpHtml(html: string): string {
  if (!html) return '';

  let content = html;

  const pageStart = content.search(/<div[^>]*data-elementor-type=["']wp-page["']/i);
  if (pageStart >= 0) {
    let end = content.length;
    const footerTypeIdx = content.search(/data-elementor-type=["']footer["']/i);
    if (footerTypeIdx > pageStart) end = Math.min(end, footerTypeIdx);
    const footerTagIdx = content.indexOf('<footer', pageStart);
    if (footerTagIdx > pageStart) end = Math.min(end, footerTagIdx);
    const bodyEndIdx = content.indexOf('</body>', pageStart);
    if (bodyEndIdx > pageStart) end = Math.min(end, bodyEndIdx);
    content = content.slice(pageStart, end).trim();
  }

  content = content.replace(/<footer[\s\S]*$/i, '').trim();
  content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  content = content.replace(
    /https?:\/\/(?:www\.)?daisywoont\.nl\/wp-content\/uploads\/[^"'\s)>]+/gi,
    (url) => localImagePathFromUpload(url)
  );
  content = content.replace(/\/wp-content\/uploads\/[^"'\s)>]+/gi, (url) => localImagePathFromUpload(url));
  content = content.replace(/\bddd\b/g, '');
  content = content.replace(/\[zb_mp_[^\]]*\]/g, '');
  content = content.replace(/\shref="#"/g, '');
  content = content.replace(/\ssrc=""/g, '');
  content = content.replace(
    /https?:\/\/(?:www\.)?daisywoont\.nl(\/[^"'\s)>]*)/gi,
    (_, path: string) => (path.endsWith('/') ? path : `${path}/`)
  );

  return content;
}
