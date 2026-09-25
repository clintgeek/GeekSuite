/**
 * The paste-a-list parser: the manual import path for GOG, Epic, Amazon and
 * Luna libraries (none of which has a public library API).
 *
 * One title per line. Blank lines are skipped, whitespace is trimmed (and runs
 * of inner whitespace collapsed), a leading list marker ("- ", "* ", "1. ",
 * "• ") is stripped so a pasted bullet list works, and duplicates are dropped
 * case-insensitively keeping the first spelling. The gateway caps
 * `createGames` at 200, so the parser does too and says how many it dropped.
 */
export const PASTE_LIST_MAX = 200;

const MARKER = /^\s*(?:[-*•·]|\d{1,3}[.)])\s+/;

export function parsePasteList(text, { max = PASTE_LIST_MAX } = {}) {
  const seen = new Set();
  const titles = [];
  let duplicates = 0;
  let overflow = 0;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const title = raw.replace(MARKER, '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    if (titles.length >= max) {
      overflow += 1;
      continue;
    }
    titles.push(title);
  }

  return { titles, duplicates, overflow };
}
