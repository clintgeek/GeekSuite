/**
 * Fold-in, the client's pure half (DOCS/CONTEXT.md §13).
 *
 * The gateway does the real work — it validates every proposed operation
 * against the note and applies them itself. Nothing here decides what a note
 * becomes; these helpers only shape what the person sees (cards, the
 * whole-note preview) and what is sent back (the accepted operations, without
 * the read-only fields the gateway added).
 */

/** The new-info ceiling the gateway enforces (`foldin.js#MAX_FOLD_INPUT_CHARS`). */
export const FOLD_IN_INPUT_MAX = 12000;

/** Note types Fold-in works on. Rich text is refused by the gateway, so it is not offered. */
export const canFoldInto = (note) => Boolean(note)
  && note.type === 'markdown'
  && !note.isLocked
  && !note.isEncrypted;

/** Fields `FoldInOperationInput` accepts — everything else is the gateway's own annotation. */
const INPUT_FIELDS = ['type', 'why', 'heading', 'markdown', 'anchor', 'items', 'tableHeaderRow', 'cells', 'find', 'replace', 'reason', 'afterHeading', 'level'];

/** An operation as the apply mutation takes it: no id, location, offsets or __typename. */
export function toOperationInput(op) {
  const out = {};
  for (const k of INPUT_FIELDS) {
    if (op[k] !== undefined && op[k] !== null) out[k] = op[k];
  }
  if (op.type === 'new_section' && !('afterHeading' in out)) out.afterHeading = null;
  return out;
}

/** "2 suggestions didn't match the note and were left out" — or null for none. */
export function droppedLine(count) {
  if (!count) return null;
  return `${count} suggestion${count === 1 ? '' : 's'} didn't match the note and ${count === 1 ? 'was' : 'were'} left out.`;
}

/** What a card says the change does, in a few words. */
export function opVerb(op) {
  switch (op.type) {
    case 'insert_after_heading':
    case 'insert_under_section_end':
      return 'Adds text';
    case 'append_to_list':
      return `Adds ${op.items?.length === 1 ? 'a list item' : `${op.items?.length || 0} list items`}`;
    case 'add_table_row':
      return 'Adds a table row';
    case 'replace_text':
      return 'Changes text';
    case 'new_section':
      return 'Adds a section';
    default:
      return 'Changes the note';
  }
}

/**
 * Markdown for a card's preview of what lands. A lone table row is not a
 * table, so it is shown under the header row it was anchored to.
 */
export function opPreviewMarkdown(op) {
  if (op.type === 'add_table_row' && op.tableHeaderRow) {
    const header = op.tableHeaderRow.trim();
    const cols = header.replace(/^\||\|$/g, '').split('|').length;
    return `${header}\n|${' --- |'.repeat(cols)}\n${op.text}`;
  }
  return op.text || '';
}

/**
 * The note with the accepted operations applied, as segments for the
 * whole-note preview: `same` (untouched), `ins` (added), `del` (removed).
 * Offsets are the gateway's, against the content the proposal was made on.
 * Blank-line padding is approximate here; the gateway's apply is exact.
 */
export function previewSegments(content, ops) {
  const src = typeof content === 'string' ? content : '';
  const sorted = [...ops].sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
  const out = [];
  let cursor = 0;
  const push = (kind, text) => { if (text) out.push({ kind, text }); };
  for (const op of sorted) {
    if (op.start < cursor || op.start > src.length) continue; // overlapping or stale — never invent
    push('same', src.slice(cursor, op.start));
    if (op.end > op.start) {
      push('del', src.slice(op.start, op.end));
      push('ins', op.text);
    } else {
      const lead = op.start > 0 && src[op.start - 1] !== '\n' ? '\n' : '';
      push('ins', `${lead}${op.text}\n`);
    }
    cursor = Math.max(cursor, op.end);
  }
  push('same', src.slice(cursor));
  return out;
}

/** What to fold in from a share: the shared title, text and link, as one piece. */
export function foldInputFromShare({ title, text, url } = {}) {
  const parts = [(title || '').trim(), (text || '').trim()].filter(Boolean);
  // A share's title is often the first line of its text; don't say it twice.
  if (parts.length === 2 && parts[1].startsWith(parts[0])) parts.shift();
  const link = (url || '').trim();
  if (link && !parts.some((p) => p.includes(link))) parts.push(link);
  return parts.join('\n\n');
}

/** The search query used to suggest where a share belongs: its first few hundred characters. */
export const suggestionQuery = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);

/**
 * Rank fold targets from a hybrid search: Markdown notes only (the others
 * can't be folded into), unlocked, in the search's own order, deduped.
 */
export function foldTargetsFrom(results, limit = 4) {
  const seen = new Set();
  const out = [];
  for (const r of results || []) {
    const id = r._id || r.id;
    if (!id || seen.has(id)) continue;
    if (r.type !== 'markdown' || r.isLocked || r.isEncrypted) continue;
    seen.add(id);
    out.push({ id, title: r.title || 'Untitled', type: r.type, matchedBy: r.matchedBy || null, snippet: r.why || r.snippet || '' });
    if (out.length >= limit) break;
  }
  return out;
}

/** A failed preview or apply, in the person's terms. */
export function foldInErrorMessage(err, { applying = false } = {}) {
  const gql = err?.graphQLErrors?.[0];
  const code = gql?.extensions?.code;
  if (code === 'CONFLICT') return gql.message || 'The note changed since these changes were proposed. Propose again.';
  if (gql?.message) return gql.message;
  if (err?.networkError) return 'Could not reach the server. Nothing was changed.';
  return err?.message || (applying ? 'Could not apply the changes. Nothing was changed.' : 'Could not propose changes.');
}

/** Why a preview came back with nothing, when the model never answered. */
export function failedPreviewMessage(provenance) {
  switch (provenance?.reason) {
    case 'cap':
      return "That's today's limit for Fold-in. Your text is still here — try again tomorrow.";
    case 'unparseable':
    case 'invalid':
      return 'The model answered with something that wasn\'t a list of changes. Your note is unchanged — try again.';
    default:
      return 'Fold-in is unavailable right now. Your note is unchanged and your text is still here.';
  }
}
