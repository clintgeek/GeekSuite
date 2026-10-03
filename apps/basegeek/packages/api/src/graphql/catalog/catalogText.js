/**
 * catalogText.js — the exact text a book or game's embedding is made from.
 * Pure functions; the same text the indexer hashes, so a content change is a
 * hash change (MCP_SPEC D16–D19).
 *
 * CATALOG METADATA ONLY. A vector is shared by the whole household — a
 * review, a rating, a note or any GamePlayer row embedded in it would leak
 * one member's words into another's search. Never add a personal field here.
 *
 * Cap: MAX_TEXT_CHARS per item, with the description truncated last — about
 * mxbai's 512-token window; past it Ollama truncates silently anyway (D17).
 */

import { createHash } from 'node:crypto';

export const MAX_TEXT_CHARS = 2000;

/** Descriptions arrive from metadata providers and can carry markup. */
export function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const list = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : '');
const year = (d) => (d ? new Date(d).getUTCFullYear() : null);

/** tags ∪ autoTags / libraryTags ∪ myTags, order kept, dupes out. */
const union = (...lists) => [...new Set(lists.flat().filter(Boolean))];

/** `Label: value` — labeled lines embed measurably better than bare values. */
const field = (label, value) => (value ? `${ label }: ${ value }` : null);

/**
 * The fixed labeled lines, then the description truncated to whatever room
 * is left — a long blurb never pushes a tag or a title out of the window.
 */
function joinCapped(lines, description) {
  const head = lines.filter(Boolean).join('\n');
  const desc = stripHtml(description);
  if (!desc) return head;
  const room = MAX_TEXT_CHARS - head.length - (head ? 1 : 0);
  if (room <= 0) return head.slice(0, MAX_TEXT_CHARS);
  const descLine = `Description: ${ desc }`;
  const body = descLine.length <= room ? descLine : descLine.slice(0, room);
  return head ? `${ head }\n${ body }` : body;
}

/** GameGeek catalog text (D16). Never GamePlayer data — see the file head. */
export function gameText(game) {
  return joinCapped(
    [
      field('Title', game?.title),
      field('Series', game?.series?.name),
      field('Developer(s)', list(game?.developers)),
      field('Publisher(s)', list(game?.publishers)),
      field('Released', year(game?.releaseDate)),
      field('Genres', list(game?.genres)),
      field('Tags', list(union(game?.tags, game?.autoTags))),
      field('Modes', list(game?.modes)),
    ],
    game?.description,
  );
}

/** BookGeek catalog text (D16). `libraryTags ∪ myTags` like the Tag facet. */
export function bookText(book) {
  return joinCapped(
    [
      field('Title', book?.title),
      field('Series', book?.series?.name),
      field('Author(s)', list(book?.authors)),
      field('Publisher', book?.publisher),
      field('Published', year(book?.publishedDate)),
      field('Tags', list(union(book?.libraryTags, book?.myTags))),
    ],
    book?.description,
  );
}

/** What the indexer compares: model + text, so a model swap re-embeds all. */
export function catalogHash(text, model) {
  return createHash('sha256').update(`${ model }${ text }`).digest('hex');
}
