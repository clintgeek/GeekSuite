/**
 * previewText — strip formatting from note content for list previews.
 *
 * @param {string} content  Raw note content.
 * @param {string} type     Note type: 'markdown' (the default) strips Markdown syntax too
 * @param {number} maxLen   Approximate character ceiling (default 180).
 * @param {object} [opts]
 * @param {boolean} [opts.shape=false]  Keep a little block structure for a
 *   human reader (heading — paragraph, item · item). Off by default.
 * @returns {string}        Clean single-line preview string.
 */
export function previewText(content = '', type = 'markdown', maxLen = 180, { shape = false } = {}) {
  if (!content) return '';
  if (typeof content === 'string' && content.startsWith('data:image/')) return '';

  let s = content;

  // Keep the shape a little: a heading runs into its first paragraph with a
  // dash ("Roadmap — Draft agenda…"), list items are separated by a middot,
  // instead of every block collapsing into one undifferentiated run.
  if (shape) {
    s = s.replace(/<\/h[1-6]>/gi, ' — ');
    s = s.replace(/<\/li>/gi, ' · ');
    if (type === 'markdown') {
      s = s.replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm, '$1 — ');
    }
  }

  // Strip HTML (inline HTML in markdown, or a leftover rich-text note)
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

  // Collapse whitespace and trim, and drop a separator left dangling at the
  // end (a heading or list item with nothing after it).
  s = s.replace(/\s+/g, ' ').trim();
  if (shape) s = s.replace(/(\s*[—·])+$/, '').replace(/·\s*—/g, '—').trim();
  return s.slice(0, maxLen);
}
