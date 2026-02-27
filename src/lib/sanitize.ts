import DOMPurify from 'isomorphic-dompurify';

/**
 * Robust server-safe HTML sanitizer.
 * Strips dangerous tags/attributes to prevent XSS.
 * Used only in API routes where we construct HTML from trusted
 * sources (PDF text, mammoth output, markdown conversion).
 */
export function sanitizeHtml(html: string): string {
  // Use isomorphic-dompurify to sanitize on the backend
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr", "div", "span",
      "strong", "b", "em", "i", "u", "s", "del", "mark", "sub", "sup",
      "ul", "ol", "li",
      "pre", "code",
      "a", "img",
      "table", "thead", "tbody", "tr", "th", "td",
      "blockquote", "figure", "figcaption",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "class", "id",
      "target", "rel",
      "width", "height",
      "colspan", "rowspan",
      "data-type", "data-language",
    ],
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "textarea", "select", "link"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  }) as string;
}
