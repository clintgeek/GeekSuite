/**
 * Android share target ("Share -> NoteGeek").
 *
 * Pure: Web Share Target GET params in, a `createNote` input out (or `null`
 * when there is nothing usable). No I/O, no navigation, no React — kept
 * separate from `pages/ShareTarget.jsx` so the parse/build logic is testable
 * without mounting a route or a mutation.
 *
 * The manifest's `share_target` (see `vite.config.js`) is `method: 'GET'`,
 * so a share lands as `/share?title=...&text=...&url=...` — no file upload,
 * see vite.config.js for why image sharing isn't wired up.
 */

/**
 * @param {{ title?: string, text?: string, url?: string }} params
 * @returns {{ title: string|null, content: string } | null}
 */
export function buildNoteFromShareParams({ title, text, url } = {}) {
  const cleanTitle = (title || '').trim();
  const cleanText = (text || '').trim();
  const cleanUrl = (url || '').trim();

  if (!cleanTitle && !cleanText && !cleanUrl) return null;

  // Title: the shared title, or the first line of the shared text.
  let noteTitle = cleanTitle;
  let body = cleanText;
  if (!noteTitle && cleanText) {
    const lines = cleanText.split(/\r?\n/);
    noteTitle = lines[0].trim();
    body = lines.slice(1).join('\n').trim();
  }

  // Body: the (remaining) text, plus the url as a markdown link.
  const parts = [];
  if (body) parts.push(body);
  if (cleanUrl) parts.push(`[${cleanUrl}](${cleanUrl})`);

  let content = parts.join('\n\n');
  // `createNote` requires non-empty content (Note.content is required in
  // the schema). A title-only share, or a one-line text with no url, would
  // otherwise build an empty body — fall back to the title so the note is
  // still saveable and nothing the user shared is lost.
  if (!content) content = noteTitle || cleanUrl || '';
  if (!content) return null;

  return { title: noteTitle || null, content };
}
