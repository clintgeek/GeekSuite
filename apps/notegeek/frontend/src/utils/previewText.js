/**
 * previewText — strip formatting from note content for list previews.
 *
 * @param {string} content  Raw note content.
 * @param {string} type     Note type: 'text' | 'markdown' | 'code' | …
 * @param {number} maxLen   Approximate character ceiling (default 180).
 * @returns {string}        Clean single-line preview string.
 */
export function previewText(content = '', type = 'text', maxLen = 180) {
  if (!content) return '';
  if (typeof content === 'string' && content.startsWith('data:image/')) return '';

  // Code notes: first non-blank line or first maxLen chars, no stripping.
  if (type === 'code') {
    const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
    return firstLine.slice(0, maxLen);
  }

  let s = content;

  // Strip HTML (rich-text + any inline HTML in markdown)
  s = s.replace(/<[^>]+>/g, ' ');

  if (type === 'markdown') {
    // Fenced code blocks → drop entirely
    s = s.replace(/```[\s\S]*?```/g, ' ');
    // Inline code → keep content, drop backticks
    s = s.replace(/`([^`]+)`/g, '$1');
    // Headings, blockquotes, unordered list markers at line start
    s = s.replace(/^\s{0,3}(#{1,6}|>+|[-*+])\s+/gm, '');
    // Numbered list markers
    s = s.replace(/^\s*\d+\.\s+/gm, '');
    // Bold / italic / strikethrough emphasis
    s = s.replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2');
    // Links → link text
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Images → alt text
    s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  }

  // Collapse whitespace and trim
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, maxLen);
}
