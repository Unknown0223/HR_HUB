/** Same allow-list as API `sanitizeNewsHtml` (news composer toolbar). */
const ALLOWED_TAGS = new Set([
  'p',
  'div',
  'br',
  'span',
  'b',
  'strong',
  'i',
  'em',
  'u',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
]);

const SAFE_HREF = /^(https?:|mailto:)/i;

export function sanitizeNewsHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!SAFE_HREF.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'mailto:') {
      return null;
    }
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Client-side pass before `dangerouslySetInnerHTML`.
 * Scripts in a `<template>` do not run; remaining nodes are allow-listed.
 */
export function sanitizeNewsHtml(html: string): string {
  if (!html || typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  const nodes = [...root.querySelectorAll('*')].reverse();
  for (const el of nodes) {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
        el.removeAttribute(attr.name);
        continue;
      }
      if (tag === 'a' && name === 'href') {
        const safe = sanitizeNewsHref(attr.value);
        if (safe) el.setAttribute('href', safe);
        else el.removeAttribute('href');
        continue;
      }
      if (tag === 'a' && name === 'target') {
        if (attr.value === '_blank') {
          el.setAttribute('rel', 'noopener noreferrer');
        } else {
          el.removeAttribute('target');
        }
        continue;
      }
      if (tag === 'a' && name === 'rel') continue;
      el.removeAttribute(attr.name);
    }
  }
  return template.innerHTML;
}
