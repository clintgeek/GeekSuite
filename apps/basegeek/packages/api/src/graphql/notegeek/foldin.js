/**
 * foldin.js — "I found a new kind of spider; put it in my spiders note."
 *
 * Fold-in takes a note that already exists and a piece of new information, and
 * proposes where in the note the new information belongs. It is the third AI
 * writer this app has had, and the first two explain every rule below.
 *
 * ## Why this is not Tidy
 *
 * Tidy (removed 2026-09-22, see `compose.js`) handed a whole note to a model
 * and wrote back whatever came out. On 2026-09-21 that silently truncated a
 * long note to ~63% of itself, and there was no history to restore from. The
 * lesson is not "add a length check"; it is that a model must never be the
 * thing that produces the text of a note somebody already wrote.
 *
 * So the safety rule here is structural:
 *
 *   **The model never writes the note.** It returns a short list of small,
 *   ANCHORED edit operations — "add these list items after the item that
 *   says `Black widow`", "add this row to the table whose header is
 *   `| Name | Region |`". This module checks every anchor against the note
 *   as it is NOW, drops (and reports) anything that does not match, and
 *   applies the survivors deterministically. Everything the model did not
 *   explicitly touch is copied byte for byte, so a long note cannot shrink
 *   by accident: the only operation that removes text at all is
 *   `replace_text`, and it must quote the exact text it removes, which must
 *   occur exactly once.
 *
 * And around that rule:
 *
 *   - **Preview writes nothing.** `foldInPreview` returns the operations and
 *     what each would do; the person reviews them, turns some off, and only
 *     `foldInApply` writes.
 *   - **Apply re-checks.** The client sends back the operations it accepted
 *     (never ids into a server-side cache — there is none) and the server
 *     re-validates them against the CURRENT note. If the note changed since
 *     the preview in a way that breaks an anchor, the apply is refused as a
 *     CONFLICT; nothing is half-applied.
 *   - **A version is snapshotted before the write**, and a failed snapshot
 *     refuses the write: Undo is the promise this feature makes, so it is not
 *     allowed to be best-effort here the way it is for a hand edit.
 *   - **Nothing is silently lost.** An operation that fails validation is
 *     dropped and listed in `stats.dropped` with its reason, and the content
 *     it carried is moved to `unplaced`, next to whatever the model itself
 *     said it could not place. The person sees all of it.
 *   - **Code fences are never edited inside.** No anchor is recognised inside
 *     a fence, no insertion point can land inside one, `replace_text` may not
 *     touch one, and inserted markdown with an unbalanced fence (which would
 *     swallow the rest of the note) is dropped.
 *
 * ## Which notes
 *
 * Markdown only. A "plain text" note in NoteGeek IS a markdown note (imported
 * `.txt` files become markdown, §9 of CONTEXT.md); one without headings simply
 * has no heading anchors, so the model is left with list appends, table rows,
 * `replace_text` and `new_section` at the end — which is what paragraphs need.
 *
 * Rich text (`text`, TipTap HTML) is REFUSED, deliberately. The gateway has no
 * markdown→HTML renderer, so an insertion would have to be HTML the model
 * wrote, run through the sanitizer — model-authored markup in a stored note,
 * which is the class of thing this design exists to avoid. `replace_text`
 * over HTML is a worse trap: the "exact text" a person sees spans tags and
 * entities that the raw string does not. Rich text is a legacy type (not
 * offered as new since 2026-09-29), so the honest answer is a clear refusal.
 * Code, mind maps and sketches are refused too. Locked and encrypted notes are
 * never sent to a model at all.
 *
 * ## Long notes
 *
 * A note up to `WHOLE_NOTE_CHARS` goes to the model whole. Past that, the
 * model gets the note's OUTLINE — every heading, the first line of every
 * section, every table's header row, the first and last item of every list —
 * plus the full text of the sections whose words overlap the new information
 * most, up to `CONTEXT_BUDGET_CHARS`. Anchors are still validated against the
 * full note, so an operation aimed at a section the model only saw in outline
 * is still checked exactly.
 *
 * Sections are chosen by word overlap, not by the local embeddings. The
 * meaning-based index (§11) is per ~300-word passage, not per section, and
 * mapping passages back to headings buys little over shared words for the
 * job of "which section mentions widows". Keeping this module off the
 * embeddings client also keeps §11's privacy boundary trivially true: the
 * modules that touch embeddings never touch the AI stack, and this one is the
 * reverse.
 *
 * ## Which model
 *
 * `prose+structured:deep`. The judgement is prose judgement (where does this
 * belong, what does it duplicate) and the answer is JSON that must parse, so
 * both: `structured` is the task with a filter behind it (the row must have
 * proved it emits JSON), `prose` adds no filter but says what the call is.
 * `deep` because nobody expects this inside a second. NoteGeek is paid-first
 * (OpenRouter gpt-4.1-mini, governed), so in practice that row answers and
 * the need's own picks are the fallback.
 */

import { z } from 'zod';
import { runAIFeature } from '../../services/aiFeatureRunner.js';

// ── knobs ────────────────────────────────────────────────────────────────────

/** What fold-in needs from a model — see the header. */
export const FOLD_IN_NEED = 'prose+structured:deep';

/** Previews per user per UTC day. One preview is one model call. */
export const FOLD_IN_DAILY_CAP = 60;

export const FOLD_IN_TIMEOUT_MS = 30000;

/** Most new-info characters one fold-in takes. Past this it is refused, not cut. */
export const MAX_FOLD_INPUT_CHARS = 12000;

/** A note at or under this goes to the model whole. */
export const WHOLE_NOTE_CHARS = 14000;

/** Characters of section text sent alongside the outline for a longer note. */
export const CONTEXT_BUDGET_CHARS = 14000;

/** The outline's own ceiling. */
export const OUTLINE_MAX_CHARS = 6000;

/** Most operations one proposal may carry; the rest are dropped and reported. */
export const MAX_OPERATIONS = 30;

/** One operation's inserted text ceiling. */
export const MAX_OP_TEXT = 8000;

/** `replace_text.find` ceiling — a replace is a correction, not a rewrite. */
export const MAX_FIND_CHARS = 1500;

export const FOLDABLE_TYPES = new Set(['markdown']);

export const OP_TYPES = [
  'insert_after_heading',
  'insert_under_section_end',
  'append_to_list',
  'add_table_row',
  'replace_text',
  'new_section',
];

/** Why a note cannot be folded into, in words a person can act on. */
export function refusalFor(note) {
  if (!note) return 'Note not found or you do not have permission to edit it';
  if (note.isLocked || note.isEncrypted) return 'Fold-in does not read locked or encrypted notes.';
  if (note.type === 'text') {
    return 'Fold-in works on Markdown notes. This is a rich-text note — its HTML cannot be edited safely in place.';
  }
  if (!FOLDABLE_TYPES.has(note.type)) return 'Fold-in works on markdown and text notes.';
  return null;
}

// ── the operation schema ─────────────────────────────────────────────────────

const why = z.string().max(400).optional().default('');
const anchorText = z.string().trim().min(1).max(500);
const blockText = z.string().max(MAX_OP_TEXT).refine((s) => s.trim().length > 0, 'is empty');
const cellText = z.string().max(1000);

/**
 * One operation, as the model (or a client sending back accepted ones) states
 * it. `.strip()` rather than `.strict()`: models add stray keys (`id`,
 * `section`) and a stray key is not a reason to lose a good suggestion. What
 * is never ignored is a missing or malformed field the op needs.
 */
export const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('insert_after_heading'), heading: anchorText, markdown: blockText, why }),
  z.object({ type: z.literal('insert_under_section_end'), heading: anchorText, markdown: blockText, why }),
  z.object({
    type: z.literal('append_to_list'),
    anchor: anchorText,
    items: z.array(z.string().max(2000)).min(1).max(50),
    why,
  }),
  z.object({
    type: z.literal('add_table_row'),
    tableHeaderRow: anchorText,
    cells: z.array(cellText).min(1).max(30),
    why,
  }),
  z.object({
    type: z.literal('replace_text'),
    find: z.string().min(1).max(MAX_FIND_CHARS),
    replace: z.string().max(MAX_OP_TEXT),
    reason: z.string().max(400).optional().default(''),
    why,
  }),
  z.object({
    type: z.literal('new_section'),
    afterHeading: z.string().trim().max(500).nullable().optional().transform((v) => v || null),
    heading: z.string().trim().min(1).max(300).refine((s) => !/[\r\n]/.test(s), 'must be one line'),
    level: z.number().int().min(1).max(6).nullable().optional(),
    markdown: z.string().max(MAX_OP_TEXT).optional().default(''),
    why,
  }),
]);

/**
 * The JSON shape the model is asked for. One flat object per operation with
 * every field optional except `type`: a discriminated `anyOf` is the kind of
 * schema free-tier providers mangle, and the real check is `operationSchema`
 * above, applied to every operation individually so one malformed op costs
 * only itself.
 */
export const FOLD_IN_SCHEMA = {
  name: 'NoteGeekFoldIn',
  description: 'Anchored edit operations that fold new information into an existing note.',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: OP_TYPES },
            why: { type: 'string' },
            heading: { type: 'string' },
            markdown: { type: 'string' },
            anchor: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
            tableHeaderRow: { type: 'string' },
            cells: { type: 'array', items: { type: 'string' } },
            find: { type: 'string' },
            replace: { type: 'string' },
            reason: { type: 'string' },
            afterHeading: { type: ['string', 'null'] },
            level: { type: 'integer' },
          },
          required: ['type'],
        },
      },
      unplaced: { type: 'array', items: { type: 'string' } },
    },
    required: ['operations'],
  },
};

// ── reading a markdown note ─────────────────────────────────────────────────

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*(?:[ \t]#+[ \t]*)?$/;
const EMPTY_HEADING_RE = /^ {0,3}(#{1,6})[ \t]*$/;
const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(\[[ xX]\][ \t]+)?(.*)$/;
const TABLE_SEP_RE = /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;

const indentWidth = (ws) => ws.replace(/\t/g, '    ').length;

/** Split a table row into trimmed cells (`| a | b |` → `['a','b']`), honouring `\|`. */
export function tableCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '\\|'; i += 1; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * The note as lines and structures. Everything is located by LINE index; a
 * line knows its start offset in the original string so edits can be made as
 * character splices that leave everything else byte-identical.
 *
 * Setext headings (`Title\n=====`) are not anchors — NoteGeek's editor writes
 * ATX, and recognising both doubles the ways a heading can be ambiguous.
 */
export function parseMarkdown(content) {
  const src = typeof content === 'string' ? content : '';
  const raw = src.split('\n');
  const lines = [];
  let offset = 0;
  let fence = null; // { char, len, from }
  let unclosedFenceFrom = null;
  for (let i = 0; i < raw.length; i += 1) {
    const text = raw[i];
    const start = offset;
    offset += text.length + (i < raw.length - 1 ? 1 : 0);
    const m = text.match(FENCE_RE);
    let inFence = Boolean(fence);
    if (m) {
      const char = m[1][0];
      if (!fence) {
        fence = { char, len: m[1].length, from: i };
        inFence = true;
      } else if (char === fence.char && m[1].length >= fence.len && !text.trim().slice(m[1].length).trim()) {
        fence = null;
        inFence = true;
      }
    }
    lines.push({ text: text.replace(/\r$/, ''), start, inFence });
  }
  if (fence) unclosedFenceFrom = fence.from;
  // The trailing empty "line" after a final newline is a position, not a line.
  const lineCount = src.endsWith('\n') ? lines.length - 1 : lines.length;

  const headings = [];
  for (let i = 0; i < lineCount; i += 1) {
    if (lines[i].inFence) continue;
    const m = lines[i].text.match(HEADING_RE);
    if (m && !EMPTY_HEADING_RE.test(lines[i].text)) {
      headings.push({ line: i, level: m[1].length, text: m[2].trim(), raw: lines[i].text.trim() });
    }
  }
  for (let h = 0; h < headings.length; h += 1) {
    const cur = headings[h];
    let sectionEnd = lineCount;
    let bodyEnd = null;
    for (let k = h + 1; k < headings.length; k += 1) {
      if (bodyEnd === null) bodyEnd = headings[k].line;
      if (headings[k].level <= cur.level) { sectionEnd = headings[k].line; break; }
    }
    cur.sectionEnd = sectionEnd;
    cur.bodyEnd = bodyEnd === null ? sectionEnd : Math.min(bodyEnd, sectionEnd);
  }

  // Lists: runs of list-item lines (plus indented continuations). A single
  // blank line inside is allowed when another item follows (a loose list).
  const lists = [];
  let current = null;
  for (let i = 0; i < lineCount; i += 1) {
    const ln = lines[i];
    const m = !ln.inFence ? ln.text.match(LIST_RE) : null;
    if (m && !HEADING_RE.test(ln.text)) {
      if (!current) { current = { start: i, end: i + 1, items: [] }; lists.push(current); }
      current.items.push({
        line: i,
        indent: indentWidth(m[1]),
        marker: m[2],
        ordered: /\d/.test(m[2]),
        checkbox: Boolean(m[3]),
        text: m[4].trim(),
      });
      current.end = i + 1;
      continue;
    }
    if (current && !ln.inFence && ln.text.trim() && /^[ \t]{2,}/.test(ln.text)) {
      current.end = i + 1; // continuation of the previous item
      continue;
    }
    if (current && !ln.text.trim()) {
      const next = lines[i + 1];
      if (i + 1 < lineCount && next && !next.inFence && LIST_RE.test(next.text)) continue;
    }
    current = null;
  }

  // Pipe tables: a header row followed by a separator row, then rows.
  const tables = [];
  for (let i = 0; i + 1 < lineCount; i += 1) {
    const a = lines[i];
    const b = lines[i + 1];
    if (a.inFence || b.inFence) continue;
    if (!a.text.includes('|') || !TABLE_SEP_RE.test(b.text) || !b.text.includes('-')) continue;
    const header = tableCells(a.text);
    let last = i + 1;
    for (let k = i + 2; k < lineCount; k += 1) {
      if (lines[k].inFence || !lines[k].text.trim() || !lines[k].text.includes('|')) break;
      last = k;
    }
    tables.push({ headerLine: i, header, cols: header.length, lastLine: last, raw: a.text.trim() });
    i = last;
  }

  return { src, lines, lineCount, headings, lists, tables, unclosedFenceFrom };
}

/** Offset of the start of line `i` (or the end of the string past the last line). */
const lineStart = (doc, i) => (i < doc.lines.length ? doc.lines[i].start : doc.src.length);

/** The heading a line sits under, or null for the preamble. */
function headingOver(doc, line) {
  let found = null;
  for (const h of doc.headings) {
    if (h.line <= line) found = h;
    else break;
  }
  return found;
}

/** Last non-blank line index in [from, to), or from-1 when all blank. */
function lastContentLine(doc, from, to) {
  for (let i = to - 1; i >= from; i -= 1) if (doc.lines[i].text.trim()) return i;
  return from - 1;
}

// ── anchoring ────────────────────────────────────────────────────────────────

/**
 * Anchor matching, decided once:
 *
 *   1. EXACT — the anchor equals the candidate's text (after the markdown
 *      prefix is stripped from both: `## `, `- [ ] `, `1. `). Exactly one
 *      exact match wins outright; two or more is ambiguous and the op drops.
 *   2. LOOSE — otherwise, compare case-folded with whitespace collapsed and
 *      trailing punctuation (`:` `.`) ignored. Exactly one loose match wins;
 *      two or more is ambiguous.
 *   3. Nothing — the op drops as `anchor_not_found`.
 *
 * Never a prefix match, never "closest": an anchor that does not name exactly
 * one place is not an anchor. `replace_text.find` is EXACT ONLY, because it
 * removes text and a loose match would remove something the model did not
 * quote.
 */
export const looseKey = (s) => String(s ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/[\s:.]+$/, '')
  .trim();

const stripHeadingPrefix = (s) => String(s ?? '').trim().replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').trim();
const stripListPrefix = (s) => String(s ?? '').trim()
  .replace(/^([-*+]|\d{1,9}[.)])\s+/, '')
  .replace(/^\[[ xX]\]\s+/, '')
  .trim();

export function matchUnique(candidates, wanted, textOf) {
  const exact = candidates.filter((c) => textOf(c) === wanted);
  if (exact.length === 1) return { match: exact[0], how: 'exact' };
  if (exact.length > 1) return { error: 'ambiguous_anchor', count: exact.length };
  const key = looseKey(wanted);
  if (!key) return { error: 'anchor_not_found' };
  const loose = candidates.filter((c) => looseKey(textOf(c)) === key);
  if (loose.length === 1) return { match: loose[0], how: 'loose' };
  if (loose.length > 1) return { error: 'ambiguous_anchor', count: loose.length };
  return { error: 'anchor_not_found' };
}

const fenceLinesIn = (text) => String(text).split('\n').filter((l) => FENCE_RE.test(l)).length;

/** Inserted text must not open a fence it does not close — it would swallow the rest of the note. */
const balancedFences = (text) => fenceLinesIn(text) % 2 === 0;

const normaliseBlock = (text) => String(text).replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');

const where = (h) => (h ? `"${h.raw}"` : 'the top of the note');

// ── resolving one operation to one splice ───────────────────────────────────

/**
 * Turn a validated operation into a character splice of the ORIGINAL note:
 * `{ start, end, text, kind }`. `kind` is `block` (separated by blank lines)
 * or `line` (a list item or table row, joined by a single newline). Inserts
 * have `start === end`. Nothing else in the note is touched.
 */
export function resolveOperation(doc, op) {
  const fail = (reason, detail = '') => ({ ok: false, reason, detail });
  const insertAt = (line) => {
    if (doc.unclosedFenceFrom !== null && line > doc.unclosedFenceFrom) {
      return null; // past an unclosed fence, everything is code
    }
    return lineStart(doc, line);
  };

  switch (op.type) {
    case 'insert_after_heading':
    case 'insert_under_section_end': {
      const wanted = stripHeadingPrefix(op.heading);
      const found = matchUnique(doc.headings, wanted, (h) => h.text);
      if (found.error) return fail(found.error, `heading "${wanted}"`);
      const h = found.match;
      const markdown = normaliseBlock(op.markdown);
      if (!markdown) return fail('empty');
      if (!balancedFences(markdown)) return fail('unbalanced_fence');
      let line;
      if (op.type === 'insert_after_heading') {
        line = h.line + 1;
      } else {
        // The end of the section's OWN text — before its first sub-heading.
        // Adding a sub-section after the sub-sections is `new_section`.
        line = lastContentLine(doc, h.line + 1, h.bodyEnd) + 1;
        if (line <= h.line) line = h.line + 1;
      }
      const at = insertAt(line);
      if (at === null) return fail('inside_code_fence');
      return {
        ok: true,
        edit: { start: at, end: at, text: markdown, kind: 'block' },
        location: op.type === 'insert_after_heading' ? `Under ${where(h)}` : `End of ${where(h)}`,
      };
    }

    case 'append_to_list': {
      const wanted = stripListPrefix(op.anchor);
      const all = doc.lists.flatMap((list) => list.items.map((item) => ({ list, item })));
      const found = matchUnique(all, wanted, (c) => c.item.text);
      if (found.error) return fail(found.error, `list item "${wanted}"`);
      const { list, item } = found.match;
      // The anchor's sibling run: items at its indent, and anything nested
      // under them, until the list ends or a shallower item starts.
      const idx = list.items.indexOf(item);
      let lastSibling = item;
      for (let k = idx + 1; k < list.items.length; k += 1) {
        const it = list.items[k];
        if (it.indent < item.indent) break;
        if (it.indent === item.indent) lastSibling = it;
      }
      // Insert after the last sibling and everything that belongs to it.
      let endLine = list.end;
      const after = list.items.find((it) => it.line > lastSibling.line && it.indent <= lastSibling.indent);
      if (after) endLine = after.line;
      endLine = lastContentLine(doc, lastSibling.line, endLine) + 1;
      const at = insertAt(endLine);
      if (at === null) return fail('inside_code_fence');
      const pad = ' '.repeat(item.indent);
      let n = lastSibling.ordered ? parseInt(lastSibling.marker, 10) : 0;
      const delim = item.ordered ? item.marker.slice(-1) : '';
      const rows = op.items
        .map((s) => stripListPrefix(String(s).replace(/[\r\n]+/g, ' ')))
        .filter(Boolean)
        .map((s) => {
          const marker = item.ordered ? `${(n += 1)}${delim}` : item.marker;
          return `${pad}${marker} ${item.checkbox ? '[ ] ' : ''}${s}`;
        });
      if (!rows.length) return fail('empty');
      const h = headingOver(doc, item.line);
      return {
        ok: true,
        edit: { start: at, end: at, text: rows.join('\n'), kind: 'line' },
        location: `List under ${where(h)}`,
      };
    }

    case 'add_table_row': {
      const wantedCells = tableCells(op.tableHeaderRow).map(looseKey);
      const exact = doc.tables.filter((t) => t.raw === op.tableHeaderRow.trim());
      let table;
      if (exact.length === 1) table = exact[0];
      else if (exact.length > 1) return fail('ambiguous_anchor', 'table header');
      else {
        const loose = doc.tables.filter((t) => t.header.length === wantedCells.length
          && t.header.every((c, i) => looseKey(c) === wantedCells[i]));
        if (loose.length > 1) return fail('ambiguous_anchor', 'table header');
        if (!loose.length) return fail('anchor_not_found', `table "${op.tableHeaderRow.trim()}"`);
        table = loose[0];
      }
      if (op.cells.length > table.cols) return fail('too_many_cells', `${op.cells.length} cells for ${table.cols} columns`);
      const cells = [...op.cells];
      while (cells.length < table.cols) cells.push('');
      const row = `| ${cells.map((c) => String(c).replace(/[\r\n]+/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim()).join(' | ')} |`;
      const at = insertAt(table.lastLine + 1);
      if (at === null) return fail('inside_code_fence');
      return {
        ok: true,
        edit: { start: at, end: at, text: row, kind: 'line' },
        location: `Table under ${where(headingOver(doc, table.headerLine))}`,
      };
    }

    case 'replace_text': {
      const { find } = op;
      const first = doc.src.indexOf(find);
      if (first === -1) return fail('text_not_found', 'the quoted text is not in the note');
      if (doc.src.indexOf(find, first + 1) !== -1) return fail('ambiguous_text', 'the quoted text appears more than once');
      if (find === op.replace) return fail('no_change');
      const end = first + find.length;
      // Never inside, or across, a code fence.
      const touched = doc.lines.filter((l, i) => i < doc.lineCount
        && l.start < Math.max(end, first + 1) && l.start + l.text.length >= first);
      if (touched.some((l) => l.inFence)) return fail('inside_code_fence');
      if (!balancedFences(op.replace)) return fail('unbalanced_fence');
      const lineIdx = doc.lines.findIndex((l) => l === touched[0]);
      return {
        ok: true,
        edit: { start: first, end, text: op.replace.replace(/\r\n?/g, '\n'), kind: 'replace' },
        location: `In ${where(headingOver(doc, lineIdx))}`,
      };
    }

    case 'new_section': {
      if (doc.headings.some((h) => looseKey(h.text) === looseKey(op.heading))) {
        return fail('duplicate_heading', `"${op.heading}" already exists — add under it instead`);
      }
      let line;
      let after = null;
      if (op.afterHeading) {
        const found = matchUnique(doc.headings, stripHeadingPrefix(op.afterHeading), (h) => h.text);
        if (found.error) return fail(found.error, `heading "${stripHeadingPrefix(op.afterHeading)}"`);
        after = found.match;
        line = lastContentLine(doc, after.line, after.sectionEnd) + 1;
      } else {
        line = lastContentLine(doc, 0, doc.lineCount) + 1;
      }
      const level = op.level || after?.level || doc.headings.find((h) => h.level > 1)?.level || 2;
      const body = normaliseBlock(op.markdown || '');
      if (!balancedFences(body)) return fail('unbalanced_fence');
      const text = `${'#'.repeat(level)} ${op.heading.trim()}${body ? `\n\n${body}` : ''}`;
      const at = insertAt(line);
      if (at === null) return fail('inside_code_fence');
      return {
        ok: true,
        edit: { start: at, end: at, text, kind: 'block' },
        location: after ? `New section after ${where(after)}` : 'New section at the end',
      };
    }

    default:
      return fail('unknown_type');
  }
}

// ── planning and applying a set ─────────────────────────────────────────────

/** What a dropped operation carried, so it can go to `unplaced` rather than vanish. */
export function contentOf(op) {
  if (!op || typeof op !== 'object') return '';
  const parts = [];
  if (typeof op.heading === 'string' && op.type === 'new_section') parts.push(op.heading);
  if (typeof op.markdown === 'string') parts.push(op.markdown);
  if (Array.isArray(op.items)) parts.push(op.items.filter((s) => typeof s === 'string').map((s) => `- ${s}`).join('\n'));
  if (Array.isArray(op.cells)) parts.push(op.cells.filter((s) => typeof s === 'string').join(' · '));
  if (typeof op.replace === 'string' && op.type === 'replace_text') parts.push(op.replace);
  return parts.map((p) => p.trim()).filter(Boolean).join('\n\n');
}

const overlaps = (a, b) => {
  // Two removals overlap if their ranges intersect; an insertion collides with
  // a removal only if it lands strictly INSIDE the removed range. Two
  // insertions at the same point are fine — they are applied in order.
  const aIns = a.start === a.end;
  const bIns = b.start === b.end;
  if (aIns && bIns) return false;
  if (aIns) return a.start > b.start && a.start < b.end;
  if (bIns) return b.start > a.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
};

/**
 * Validate a list of raw operations against a note's content.
 *
 * @returns {{ accepted: Array<{index, op, edit, location}>, dropped: Array<{index, type, reason, detail, content}> }}
 *   Every input operation is in exactly one of the two lists.
 */
export function planOperations(content, rawOps) {
  const doc = parseMarkdown(content);
  const accepted = [];
  const dropped = [];
  const list = Array.isArray(rawOps) ? rawOps : [];
  list.forEach((raw, index) => {
    const type = typeof raw?.type === 'string' ? raw.type : null;
    const drop = (reason, detail = '') => dropped.push({ index, type, reason, detail, content: contentOf(raw) });
    if (index >= MAX_OPERATIONS) return drop('too_many', `only ${MAX_OPERATIONS} changes are applied at once`);
    // GraphQL input objects carry explicit nulls for absent fields; zod's
    // optional() means undefined, so nulls are dropped first.
    const cleaned = raw && typeof raw === 'object'
      ? Object.fromEntries(Object.entries(raw).filter(([k, v]) => v !== null || k === 'afterHeading'))
      : raw;
    const parsed = operationSchema.safeParse(cleaned);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return drop('malformed', issue ? `${issue.path.join('.') || 'type'} ${issue.message}`.trim() : '');
    }
    const op = parsed.data;
    const resolved = resolveOperation(doc, op);
    if (!resolved.ok) return drop(resolved.reason, resolved.detail);
    const clash = accepted.find((a) => overlaps(a.edit, resolved.edit));
    if (clash) return drop('overlap', `overlaps change ${clash.index + 1}`);
    accepted.push({ index, op, edit: resolved.edit, location: resolved.location });
  });
  return { accepted, dropped };
}

/**
 * Splice the edits into the content. Everything between edits is copied
 * verbatim. Insertions at the same point keep their order; blocks are
 * separated from their neighbours by exactly one blank line, list items and
 * table rows by a single newline.
 */
export function applyEdits(content, edits) {
  const src = typeof content === 'string' ? content : '';
  const sorted = edits
    .map((e, seq) => ({ ...e, seq }))
    .sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start) || a.seq - b.seq);
  let out = '';
  let cursor = 0;
  let i = 0;
  while (i < sorted.length) {
    const e = sorted[i];
    out += src.slice(cursor, e.start);
    if (e.kind === 'replace') {
      out += e.text;
      cursor = e.end;
      i += 1;
      continue;
    }
    // Gather every insertion at this offset into one piece.
    const group = [];
    while (i < sorted.length && sorted[i].start === e.start && sorted[i].kind !== 'replace') {
      group.push(sorted[i]);
      i += 1;
    }
    out += renderInsertion(src, e.start, group);
    cursor = e.start;
  }
  out += src.slice(cursor);
  return out;
}

function renderInsertion(src, at, group) {
  let body = '';
  group.forEach((g, n) => {
    if (n > 0) body += (g.kind === 'block' || group[n - 1].kind === 'block') ? '\n\n' : '\n';
    body += g.text;
  });
  const before = src.slice(0, at);
  const after = src.slice(at);
  const first = group[0];
  const last = group[group.length - 1];
  let lead = '';
  if (before.length && !before.endsWith('\n')) lead = '\n'; // end the last line first
  const prevLine = (lead ? before : before.slice(0, -1)).split('\n').pop();
  if (first.kind === 'block' && before.length && prevLine.trim()) lead += '\n';
  let trail = '\n';
  const nextLine = after.split('\n')[0];
  if (!after.length) trail = before.endsWith('\n') || lead ? '\n' : '';
  if (last.kind === 'block' && after.length && nextLine.trim()) trail += '\n';
  if (!after.length && !src.endsWith('\n')) trail = '';
  return lead + body + trail;
}

/** Apply a validated plan. */
export function applyPlan(content, plan) {
  return applyEdits(content, plan.accepted.map((a) => a.edit));
}

// ── what the model is shown ─────────────────────────────────────────────────

const STOP = new Set('the and for are but not you all any can had her was one our out has his how its may new now see two way who did get use with that this from they have what when your will been more some than them then were into just like also only very over such about after which their there these would could should other where while being those'.split(' '));

export const termsOf = (text) => new Set(
  String(text || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu)?.filter((w) => !STOP.has(w)) || []
);

/** The note's sections — preamble plus each heading's OWN text — in order. */
export function sectionsOf(doc) {
  const out = [];
  const firstHeading = doc.headings[0]?.line ?? doc.lineCount;
  if (firstHeading > 0) out.push({ heading: null, from: 0, to: firstHeading });
  for (const h of doc.headings) out.push({ heading: h, from: h.line, to: h.bodyEnd });
  return out.map((s) => ({
    ...s,
    text: doc.src.slice(lineStart(doc, s.from), lineStart(doc, s.to)).replace(/\s+$/, ''),
  }));
}

/** Headings, the first line of each section, table headers and list ends. */
export function outlineOf(doc) {
  const out = [];
  const firstLineAfter = (from, to) => {
    for (let i = from; i < to; i += 1) {
      const t = doc.lines[i].text.trim();
      if (t && !HEADING_RE.test(doc.lines[i].text)) return t.length > 140 ? `${t.slice(0, 140)}…` : t;
    }
    return null;
  };
  const tableAt = new Map(doc.tables.map((t) => [t.headerLine, t]));
  const listAt = new Map(doc.lists.map((l) => [l.start, l]));
  for (const s of sectionsOf(doc)) {
    if (s.heading) out.push(s.heading.raw);
    const first = firstLineAfter(s.heading ? s.from + 1 : s.from, s.to);
    if (first) out.push(`  (first line) ${first}`);
    for (let i = s.from; i < s.to; i += 1) {
      if (tableAt.has(i)) out.push(`  (table header) ${tableAt.get(i).raw}`);
      if (listAt.has(i)) {
        const items = listAt.get(i).items;
        out.push(`  (list) first item: ${items[0].text}${items.length > 1 ? ` · last item: ${items[items.length - 1].text} · ${items.length} items` : ''}`);
      }
    }
  }
  let text = out.join('\n');
  if (text.length > OUTLINE_MAX_CHARS) text = `${text.slice(0, OUTLINE_MAX_CHARS)}\n(outline truncated)`;
  return text;
}

/**
 * What the model sees of the note.
 *
 * @returns {{ text: string, stats: { strategy, sectionsTotal, sectionsSent, sentChars } }}
 */
export function buildNoteContext(note, input) {
  const content = note.content || '';
  const doc = parseMarkdown(content);
  const sections = sectionsOf(doc);
  if (content.length <= WHOLE_NOTE_CHARS) {
    return {
      text: `THE NOTE (complete):\n<<<NOTE\n${content}\nNOTE>>>`,
      stats: { strategy: 'whole', sectionsTotal: sections.length, sectionsSent: sections.length, sentChars: content.length },
    };
  }
  const wanted = termsOf(input);
  const scored = sections.map((s, i) => {
    const headTerms = termsOf(s.heading?.text || '');
    const bodyTerms = termsOf(s.text);
    let score = 0;
    for (const w of wanted) {
      if (headTerms.has(w)) score += 3;
      if (bodyTerms.has(w)) score += 1;
    }
    return { s, i, score };
  });
  const chosen = [];
  let used = 0;
  for (const c of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (c.score <= 0 && chosen.length) break;
    if (used + c.s.text.length > CONTEXT_BUDGET_CHARS) continue;
    chosen.push(c);
    used += c.s.text.length;
  }
  chosen.sort((a, b) => a.i - b.i);
  const outline = outlineOf(doc);
  const text = [
    `THE NOTE is long (${content.length} characters), so you see its OUTLINE and the full text of the sections most likely to matter. Anchors must still be quoted exactly from the note; headings in the outline are exact.`,
    `OUTLINE:\n<<<OUTLINE\n${outline}\nOUTLINE>>>`,
    `SECTIONS IN FULL:\n${chosen.map((c) => `<<<SECTION\n${c.s.text}\nSECTION>>>`).join('\n')}`,
  ].join('\n\n');
  return {
    text,
    stats: { strategy: 'outline', sectionsTotal: sections.length, sectionsSent: chosen.length, sentChars: outline.length + used },
  };
}

export const FOLD_IN_SYSTEM_PROMPT = `You fold new information into a note someone already wrote. You do NOT rewrite the note. You return a short list of small, anchored edit operations as JSON, and software applies them exactly.

Operation types (EVERY operation, including replace_text, also has "why": one short line saying why it goes there):
- insert_after_heading { heading, markdown } — add markdown right under an existing heading, before that section's text.
- insert_under_section_end { heading, markdown } — add markdown at the end of an existing section's own text.
- append_to_list { anchor, items } — add items to an existing list. anchor = the exact text of one item already in that list (without its "- " marker). items = plain item texts, no markers.
- add_table_row { tableHeaderRow, cells } — add a row to an existing pipe table. tableHeaderRow = that table's header row copied exactly (e.g. "| Name | Region |"). cells = one value per column, in order.
- replace_text { find, replace, reason } — correct or update existing text. find = text copied EXACTLY from the note, long enough to appear only once. This is the ONLY way to change or remove existing text; use it only when the new information corrects or updates what the note says.
- new_section { afterHeading, heading, level, markdown } — a new section when nothing existing fits. afterHeading = the exact heading it follows (null = the end of the note). Never create a heading that already exists.

Rules:
1. COPY ANCHORS EXACTLY. Headings, list items, table header rows and find text must be copied character for character from the note. Never paraphrase an anchor.
2. FOLLOW THE NOTE'S SHAPE. If the note keeps things in a table, add a row. If it lists them, add list items. If it has a section per kind of thing, add under or beside the matching section, in the same style and heading level as its neighbours.
3. ADD, DON'T REWRITE. Prefer inserts. Never restate, reorder, summarise or "improve" existing text. Use replace_text ONLY when the new information explicitly says the note is wrong or a value has changed ("correction", "actually", "not X", "now Y"). A new sighting, example, measurement or location is an ADDITION — add it (a new row, item or sentence); never overwrite an existing value with it.
4. KEEP THE SPECIFICS of the new information verbatim — names, numbers, dates, URLs, code.
5. DO NOT INVENT. Add nothing that is not in the new information. Skip what the note already says.
6. Never put anything inside a fenced code block.
7. Anything in the new information you cannot place sensibly goes in "unplaced" as a short quote, so the person can decide. Never silently leave something out.
8. Few operations. One well-placed operation beats five fragments.

Return JSON only: {"summary": "one sentence on what you changed", "operations": [...], "unplaced": [...]}`;

/** Ask the model. Returns the raw parsed answer, or null and why. */
async function askModel({ note, input, userId, ai }) {
  const context = buildNoteContext(note, input);
  const user = [
    `NOTE TITLE: ${note.title || '(untitled)'}`,
    context.text,
    `NEW INFORMATION to fold in:\n<<<NEW\n${input}\nNEW>>>`,
  ].join('\n\n');
  const result = await runAIFeature({
    app: 'notegeek',
    feature: 'fold_in',
    userId,
    system: FOLD_IN_SYSTEM_PROMPT,
    user,
    schema: FOLD_IN_SCHEMA,
    need: FOLD_IN_NEED,
    maxCallsPerDay: FOLD_IN_DAILY_CAP,
    timeoutMs: FOLD_IN_TIMEOUT_MS,
    maxTokens: 3000,
    validate: (d) => Boolean(d) && typeof d === 'object' && Array.isArray(d.operations),
    fallback: () => null,
    ...(ai ? { ai } : {}),
  });
  return { data: result.data, provenance: result.provenance, context };
}

const publicOp = (a) => ({
  id: `op${a.index + 1}`,
  ...a.op,
  // Live (gpt-4.1-mini, 2026-10-01): a replace_text's explanation arrives in
  // `reason` with `why` left empty, twice out of two. The card shows `why`.
  why: a.op.why || a.op.reason || '',
  location: a.location,
  start: a.edit.start,
  end: a.edit.end,
  text: a.edit.text,
});

/**
 * Propose how to fold `input` into `note`. Writes nothing.
 *
 * @returns {Promise<{operations, summary, unplaced, stats, provenance, baseUpdatedAt}>}
 */
export async function foldInPreview({ note, input, userId, ai = undefined, log = null }) {
  const text = typeof input === 'string' ? input.replace(/\r\n?/g, '\n').trim() : '';
  const content = note.content || '';
  const baseStats = {
    inputChars: text.length,
    noteChars: content.length,
    strategy: 'none',
    sectionsTotal: 0,
    sectionsSent: 0,
    sentChars: 0,
    proposed: 0,
    valid: 0,
    dropped: [],
    failed: false,
    truncated: false,
  };
  const base = { operations: [], summary: '', unplaced: [], baseUpdatedAt: note.updatedAt };

  const { data, provenance, context } = await askModel({ note, input: text, userId, ai });
  const stats = { ...baseStats, ...context.stats };
  stats.truncated = provenance?.finishReason === 'length';

  if (!data) {
    // The whole call failed (cap, unavailable, unparseable). Said so, plainly:
    // an empty proposal must never look like "nothing to add".
    stats.failed = true;
    log?.info?.({ noteId: String(note._id), ...stats, reason: provenance?.reason }, '[notegeek] fold-in: no model answer');
    return { ...base, stats, provenance };
  }

  const rawOps = Array.isArray(data.operations) ? data.operations : [];
  const plan = planOperations(content, rawOps);
  const unplaced = (Array.isArray(data.unplaced) ? data.unplaced : [])
    .filter((s) => typeof s === 'string' && s.trim())
    .map((s) => s.trim().slice(0, MAX_OP_TEXT));
  for (const d of plan.dropped) if (d.content) unplaced.push(d.content);

  stats.proposed = rawOps.length;
  stats.valid = plan.accepted.length;
  stats.dropped = plan.dropped.map(({ index, type, reason, detail }) => ({ index, type, reason, detail }));
  log?.info?.({
    noteId: String(note._id),
    strategy: stats.strategy,
    noteChars: stats.noteChars,
    sentChars: stats.sentChars,
    sectionsSent: stats.sectionsSent,
    sectionsTotal: stats.sectionsTotal,
    proposed: stats.proposed,
    valid: stats.valid,
    dropped: stats.dropped.map((d) => d.reason),
    model: provenance?.model,
  }, '[notegeek] fold-in preview');

  return {
    ...base,
    operations: plan.accepted.map(publicOp).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id, undefined, { numeric: true })),
    summary: typeof data.summary === 'string' ? data.summary.trim().slice(0, 600) : '',
    unplaced,
    stats,
    provenance,
  };
}
