#!/usr/bin/env node
/**
 * migrate-notes-to-markdown.js — one-time (idempotent) conversion of every
 * live NoteGeek note that is not `markdown` or `handwritten` into a markdown
 * note (2026-11-25: NoteGeek keeps two note types).
 *
 *   text (rich text)   HTML → markdown (paragraphs, links, emphasis, headings,
 *                      lists, code, quotes; any other tag is dropped, its
 *                      words kept)
 *   no type / other    the body is kept as it is; only the type is set
 *
 * Each note is written through the `updateNote` resolver as its own owner, so
 * the note as it stood goes into its history first (restore it from the
 * note's History in NoteGeek) and preview / search text are re-derived.
 * `updatedAt` is then put back: a conversion is not an edit and must not
 * reorder anyone's list.
 *
 * Locked or encrypted notes are skipped and counted. Recently deleted notes
 * are left alone (they are purged after 30 days).
 *
 * Prints ids, titles and sizes only, never a note's body.
 *
 * Usage (inside the basegeek container, from packages/api):
 *   node scripts/migrate-notes-to-markdown.js            dry run (default), writes NOTHING
 *   node scripts/migrate-notes-to-markdown.js --apply    convert
 */
import { JSDOM } from 'jsdom';

const APPLY = process.argv.includes('--apply');
const KEEP = ['markdown', 'handwritten'];

/** Inline children of a node, as markdown. */
function inline(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { out += child.textContent.replace(/\s+/g, ' '); continue; }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    const inner = inline(child);
    if (tag === 'br') out += '\n';
    else if (tag === 'a') {
      const href = child.getAttribute('href');
      out += href && inner.trim() && inner.trim() !== href ? `[${inner.trim()}](${href})` : (href || inner);
    } else if (tag === 'strong' || tag === 'b') out += inner.trim() ? `**${inner.trim()}**` : '';
    else if (tag === 'em' || tag === 'i') out += inner.trim() ? `*${inner.trim()}*` : '';
    else if (tag === 'code') out += inner.trim() ? `\`${child.textContent}\`` : '';
    else out += inner;
  }
  return out;
}

const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'blockquote', 'hr']);

/** Block children of a node, as markdown paragraphs. */
function blocks(node) {
  const out = [];
  let run = '';
  const flush = () => { if (run.trim()) out.push(run.trim()); run = ''; };
  for (const child of node.childNodes) {
    const tag = child.nodeType === 1 ? child.tagName.toLowerCase() : null;
    if (!tag || !BLOCKS.has(tag)) {
      // Loose text and inline tags between blocks are one paragraph.
      const holder = child.ownerDocument.createElement('span');
      holder.appendChild(child.cloneNode(true));
      run += inline(holder);
      continue;
    }
    flush();
    if (/^h[1-6]$/.test(tag)) out.push(`${'#'.repeat(Number(tag[1]))} ${inline(child).trim()}`);
    else if (tag === 'ul' || tag === 'ol') {
      const items = [...child.children].filter((li) => li.tagName.toLowerCase() === 'li');
      out.push(items.map((li, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${inline(li).trim()}`).join('\n'));
    } else if (tag === 'pre') out.push(`\`\`\`\n${child.textContent.replace(/\n+$/, '')}\n\`\`\``);
    else if (tag === 'blockquote') out.push(blocks(child).join('\n\n').split('\n').map((l) => `> ${l}`).join('\n'));
    else if (tag === 'hr') out.push('---');
    else if (tag === 'div') out.push(...blocks(child));
    else out.push(inline(child).trim());
  }
  flush();
  return out.filter(Boolean);
}

export function htmlToMarkdown(html) {
  const { document } = new JSDOM(`<body>${String(html || '')}</body>`).window;
  return blocks(document.body).join('\n\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

async function main() {
  const { default: Note } = await import('../src/graphql/notegeek/models/Note.js');
  const { resolvers } = await import('../src/graphql/notegeek/resolvers.js');
  await Note.db.asPromise();

  const rows = await Note.find(
    { deletedAt: null, type: { $nin: KEEP } },
    { title: 1, type: 1, content: 1, userId: 1, updatedAt: 1, isLocked: 1, isEncrypted: 1 },
  ).lean();

  let done = 0;
  let skipped = 0;
  for (const row of rows) {
    const id = String(row._id);
    const label = `${id}  ${row.type ?? '(no type)'}  "${row.title || ''}"`;
    if (row.isLocked || row.isEncrypted) {
      console.log(`skip (locked)   ${label}`);
      skipped += 1;
      continue;
    }
    const before = String(row.content || '');
    const after = row.type === 'text' ? htmlToMarkdown(before) : before;
    console.log(`${APPLY ? 'convert' : 'would convert'}  ${label}  ${before.length} -> ${after.length} chars`);
    if (!APPLY) continue;
    // eslint-disable-next-line no-await-in-loop
    await resolvers.Mutation.updateNote(null, { id, type: 'markdown', content: after }, { user: { id: String(row.userId) } });
    // eslint-disable-next-line no-await-in-loop
    await Note.collection.updateOne({ _id: row._id }, { $set: { updatedAt: row.updatedAt } });
    done += 1;
  }
  console.log(`${rows.length} notes found; ${APPLY ? `${done} converted` : 'dry run, nothing written'}; ${skipped} skipped`);
  process.exit(0);
}

// Run only as a script (the converter is imported by its test).
if (process.argv[1] && process.argv[1].endsWith('migrate-notes-to-markdown.js')) {
  main().catch((err) => { console.error(err?.message || err); process.exit(1); });
}
