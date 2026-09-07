import sanitizeHtml from 'sanitize-html';

/**
 * Tags the news composer actually produces (contentEditable + toolbar):
 * bold / italic / underline, quote, lists, links, and line-break wrappers.
 */
export const NEWS_HTML_ALLOWED_TAGS = [
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
] as const;

const SAFE_HREF = /^(https?:|mailto:)/i;

function sanitizeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!SAFE_HREF.test(trimmed)) return undefined;
  return trimmed;
}

/** Strip scripts, event handlers, and dangerous URLs. Keep simple formatting. */
export function sanitizeNewsHtml(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: [...NEWS_HTML_ALLOWED_TAGS],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tagName, attribs) => {
        const href = sanitizeHref(attribs.href);
        if (!href) {
          return { tagName: 'a', attribs: {} };
        }
        const blank = attribs.target === '_blank';
        return {
          tagName: 'a',
          attribs: {
            href,
            ...(blank ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          },
        };
      },
    },
  }).trim();
}

export function newsHtmlLooksExecutable(html: string): boolean {
  return (
    /<script\b/i.test(html) ||
    /<iframe\b/i.test(html) ||
    /<object\b/i.test(html) ||
    /<embed\b/i.test(html) ||
    /<svg\b/i.test(html) ||
    /<math\b/i.test(html) ||
    /<link\b/i.test(html) ||
    /<meta\b/i.test(html) ||
    /<style\b/i.test(html) ||
    /<img\b/i.test(html) ||
    /\son[a-z]+\s*=/i.test(html) ||
    /javascript\s*:/i.test(html) ||
    /vbscript\s*:/i.test(html) ||
    /data\s*:/i.test(html)
  );
}
