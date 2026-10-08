/**
 * chunking.js — a note → the passages that get embedded. Pure; no Mongo, no
 * network.
 *
 * One vector per note would blur a long note into its average subject, so a
 * long note is cut into passages of ~250–350 words, each embedded on its own,
 * and a search matches the best passage. The title opens the first passage
 * (always), so a note is findable by what it is called even when its body is
 * a list of part numbers.
 *
 * What text a note has, by type:
 *   - markdown: the body as written (headings and all — they are good cut points)
 *   - text:     TipTap HTML with the tags stripped (block tags → paragraph breaks)
 *   - code:     the code (content is `{ language, code }` JSON, or a raw string
 *               from before that format)
 *   - mindmap:  the node labels, one per line
 *   - handwritten (sketch / photo pages): no text — the title alone, or nothing
 *   - locked / encrypted notes: the title alone. Their body may be ciphertext,
 *     and search already refuses to show it, so it is not embedded either.
 */

import { createHash } from 'node:crypto';

/** A passage closes once it reaches this many words at a paragraph boundary... */
export const CHUNK_MIN_WORDS = 250;
/** ...and never grows past this; a single longer paragraph is split by words. */
export const CHUNK_MAX_WORDS = 350;
/** Words carried from the end of one passage into the next, so a thought that
 * straddles the cut is whole in at least one of them. */
export const CHUNK_OVERLAP_WORDS = 40;
/** A pathological note stops being chunked here (~20 000 words). The rest is
 * still keyword-searchable; it just has no vectors. */
export const MAX_CHUNKS_PER_NOTE = 60;
/** A passage is cut to this many characters however many words it has. */
export const MAX_CHUNK_CHARS = 3000;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** TipTap HTML → plain text with paragraph breaks where blocks ended. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr|table|br|hr)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi, (m, ent) => {
      const key = ent.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16) || 32);
      if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10) || 32);
      return m;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*(\n\s*)+/g, '\n\n')
    .trim();
}

/** A code note's source: the JSON `{ code }` form or the raw text. */
export function codeText(content) {
  const raw = String(content ?? '');
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.code === 'string') return parsed.code;
    } catch { /* not the JSON form — treat as raw code */ }
  }
  return raw;
}

function mindmapText(content) {
  try {
    const parsed = JSON.parse(String(content ?? ''));
    const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
    return nodes
      .map((n) => (typeof n?.data?.label === 'string' ? n.data.label.trim() : ''))
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

/** The searchable text of a note: `{ title, body }`, both plain strings. */
export function noteText(note) {
  const title = String(note?.title ?? '').trim();
  if (!note || note.isLocked || note.isEncrypted) return { title, body: '' };
  switch (note.type) {
    case 'markdown': return { title, body: String(note.content ?? '').trim() };
    case 'text': return { title, body: htmlToText(note.content) };
    case 'code': return { title, body: codeText(note.content).trim() };
    case 'mindmap': return { title, body: mindmapText(note.content) };
    default: return { title, body: '' }; // handwritten, unknown
  }
}

const words = (s) => s.split(/\s+/).filter(Boolean);

/** Paragraph-ish blocks: blank lines split; a markdown heading starts its own block. */
function blocksOf(body) {
  const blocks = [];
  for (const para of body.split(/\n\s*\n/)) {
    let current = [];
    for (const line of para.split('\n')) {
      if (/^\s{0,3}#{1,6}\s/.test(line) && current.length) {
        blocks.push({ text: current.join('\n'), heading: false });
        current = [];
      }
      current.push(line);
    }
    if (current.length) {
      const text = current.join('\n').trim();
      if (text) blocks.push({ text, heading: /^\s{0,3}#{1,6}\s/.test(current[0]) });
    }
  }
  return blocks;
}

/**
 * A note → the strings to embed, in order. `[]` when the note has no text at
 * all (an untitled sketch), which the indexer records as "skipped".
 */
export function chunkNote(note) {
  const { title, body } = noteText(note);
  if (!body) return title ? [title.slice(0, MAX_CHUNK_CHARS)] : [];

  const chunks = [];
  let current = []; // words of the passage being built
  const flush = () => {
    if (!current.length) return;
    chunks.push(current.join(' '));
    current = current.length > CHUNK_OVERLAP_WORDS ? current.slice(-CHUNK_OVERLAP_WORDS) : [];
  };
  // Words already carried over as overlap don't count as new material: a
  // passage that is nothing but overlap is never emitted.
  let fresh = 0;
  const push = (ws) => { current.push(...ws); fresh += ws.length; };
  const close = () => { if (fresh > 0) flush(); else current = []; fresh = 0; };

  for (const block of blocksOf(body)) {
    const ws = words(block.text);
    // A heading is a natural cut: take it once the passage is big enough.
    if (block.heading && current.length >= CHUNK_MIN_WORDS) close();
    if (current.length + ws.length <= CHUNK_MAX_WORDS) {
      push(ws);
      if (current.length >= CHUNK_MIN_WORDS) close();
      continue;
    }
    // Doesn't fit. Close what we have at the paragraph boundary if it is
    // worth a passage, then feed the block in word windows.
    if (current.length >= CHUNK_MIN_WORDS / 2) close();
    let rest = ws;
    while (rest.length) {
      const room = CHUNK_MAX_WORDS - current.length;
      push(rest.slice(0, room));
      rest = rest.slice(room);
      if (current.length >= CHUNK_MAX_WORDS) close();
    }
    if (chunks.length >= MAX_CHUNKS_PER_NOTE) break;
  }
  if (fresh > 0) flush();

  const out = chunks.slice(0, MAX_CHUNKS_PER_NOTE);
  if (title) out[0] = `${ title }\n\n${ out[0] }`;
  return out.map((c) => c.slice(0, MAX_CHUNK_CHARS));
}

/**
 * What decides "this note needs re-embedding": the model and the exact
 * passages. Tags, pinning and timestamps are not in it — changing those never
 * costs a round trip to the embeddings service.
 */
export function chunksHash(chunks, model) {
  return createHash('sha256').update(JSON.stringify([model, chunks])).digest('hex');
}
