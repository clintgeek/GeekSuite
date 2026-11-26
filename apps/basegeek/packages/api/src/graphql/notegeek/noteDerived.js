/**
 * noteDerived.js — what a note's words are, without its markup: the text word
 * search indexes (`wordText`), the short `preview` lists show, and the search
 * snippet around a hit. Pure: no Mongo, no network, nothing from the AI stack
 * (models/Note.js imports it, and the privacy test walks that graph).
 *
 * By type (the same reading chunking.js gives the embedder):
 *   markdown    the text as written, minus markup that is not words
 *   text        TipTap HTML with the tags stripped
 *   code        the code (not the `{ language, code }` JSON around it)
 *   mindmap     the node labels (not the graph JSON)
 *   handwritten the recognised handwriting (sketchTranscript), never the
 *               tldraw JSON
 * An encrypted note has no words here: its body is ciphertext.
 */
import { htmlToText, codeText, mindmapText } from './chunking.js';
import { sketchSearchText } from './sketchText.js';
import { mermaidLabels } from './mermaidCheck.js';

/** Bump when what these functions produce changes; wordIndex.js re-derives every note below it. */
export const DERIVED_VERSION = 3; // 3: a markdown preview drops a leading heading that repeats the title
/** About two lines of a list row. */
export const PREVIEW_CHARS = 200;
export const SNIPPET_CHARS = 200;
const SKETCH = 'handwritten';

/**
 * A ```mermaid fence (a diagram, HANDWRITING.md "Turn into a diagram") as its
 * words: the node and arrow labels joined by " · ", not Mermaid syntax. Any
 * fence length, backticks or tildes; an unclosed fence runs to the end.
 * No DERIVED_VERSION bump with it: no stored note had such a fence yet.
 */
export function mermaidFencesAsWords(md) {
  const lines = String(md ?? '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*\r?$/i.exec(lines[i]);
    if (!open) { out.push(lines[i]); continue; }
    const fence = open[1];
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(lines[j]);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) break;
      body.push(lines[j]);
    }
    out.push(mermaidLabels(body.join('\n')).join(' · '));
    i = j;
  }
  return out.join('\n');
}

/** Markdown → its words: links keep their text, emphasis and heading marks go. */
export function markdownToText(md) {
  return mermaidFencesAsWords(md)
    .replace(/```[^\n]*\n/g, '\n')
    .replace(/```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/^\s*([-*_]\s*){3,}$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*(\n\s*)+/g, '\n\n')
    .trim();
}

/** A note's words, by type. `note` needs type, content, sketchTranscript, isEncrypted. */
export function wordTextFor(note) {
  if (!note || note.isEncrypted) return '';
  const type = note.type || 'markdown';
  if (type === SKETCH) return sketchSearchText(note.sketchTranscript);
  const content = typeof note.content === 'string' ? note.content : '';
  switch (type) {
    case 'markdown': return markdownToText(content);
    case 'text': return htmlToText(content);
    case 'code': return codeText(content).trim();
    case 'mindmap': return mindmapText(content);
    default: return content;
  }
}

/** Cut at a word boundary with an ellipsis. */
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max).replace(/\s+\S*$/, '');
  return `${ cut || text.slice(0, max) }…`;
}

const sameText = (a, b) => String(a).toLowerCase().replace(/\s+/g, ' ').trim()
  === String(b).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A markdown body without its first line when that line is a heading whose
 * text is the note's title (case and spacing aside): the list row already
 * shows the title above the preview. Any other heading stays.
 */
export function withoutTitleHeading(content, title) {
  const t = typeof title === 'string' ? title.trim() : '';
  if (!t || typeof content !== 'string') return content;
  const lines = content.split('\n');
  const at = lines.findIndex((l) => l.trim() !== '');
  if (at < 0) return content;
  const m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[at].replace(/\r$/, ''));
  if (!m || !sameText(markdownToText(m[1]), markdownToText(t))) return content;
  return lines.slice(at + 1).join('\n');
}

/**
 * A heading runs into what follows it with a dash ("Roadmap — Draft agenda…"),
 * the shape the client's `previewText({ shape: true })` gives, instead of
 * reading as the first words of the paragraph.
 */
const headingsDashed = (content) => String(content).replace(/^([ \t]{0,3}#{1,6}[ \t]+)(.+?)[ \t]*#*[ \t]*$/gm, '$1$2 —');

/**
 * Plain text for a list row: about PREVIEW_CHARS of the note's words on one
 * line (a markdown note's leading heading is left out when it repeats the
 * title). Locked and encrypted notes have none (the list must not show them).
 */
export function previewFor(note) {
  if (!note || note.isLocked || note.isEncrypted) return '';
  const markdown = (note.type || 'markdown') === 'markdown' && typeof note.content === 'string';
  const src = markdown
    ? { ...note, content: headingsDashed(withoutTitleHeading(note.content, note.title)) }
    : note;
  // A heading with nothing after it leaves its dash dangling: drop it.
  const words = wordTextFor(src).replace(/\s+/g, ' ').trim().replace(/(\s*—)+$/, '').replace(/—(\s*—)+/g, '—').trim();
  return clip(words, PREVIEW_CHARS);
}

/** Both derived fields at once, plus the version stamp. */
export function derivedFields(note) {
  return { wordText: wordTextFor(note), preview: previewFor(note), derivedV: DERIVED_VERSION };
}

/** Query words worth finding: 2+ characters, lowercased, quotes and operators dropped. */
export function queryTerms(q) {
  return [...new Set(String(q ?? '')
    .toLowerCase()
    .replace(/["“”]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2))];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The words around the first query term that starts a word in `text`
 * ("day" finds "day off", never the end of "Sunday"). No hit: the opening.
 * Plain text in, plain text out — the client highlights.
 */
export function snippetAround(text, q, max = SNIPPET_CHARS) {
  const plain = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const terms = queryTerms(q);
  let at = -1;
  if (terms.length) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${ terms.map(escapeRe).join('|') })`, 'iu');
    const m = re.exec(plain);
    if (m) at = m.index + m[1].length;
  }
  if (at <= 0) return clip(plain, max);
  const lead = Math.floor(max * 0.35);
  let start = Math.max(0, at - lead);
  // Start on a word, never in the middle of one.
  if (start > 0) {
    const space = plain.lastIndexOf(' ', start);
    start = space >= 0 && at - space <= lead + 20 ? space + 1 : start;
  }
  let s = plain.slice(start, start + max);
  if (start + max < plain.length) s = `${ s.replace(/\s+\S*$/, '') }…`;
  return start > 0 ? `…${ s }` : s;
}
