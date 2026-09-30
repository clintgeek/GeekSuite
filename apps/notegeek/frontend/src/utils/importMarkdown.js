import { DOC_CONTENT_MAX } from './saveGuards';

/**
 * importMarkdown.js — a Markdown (or text) file as a new note
 * (DOCS/CONTEXT.md §9).
 *
 * Dropped on the app on desktop, or picked with "Import a Markdown file" on
 * the New surfaces; either way each file becomes one new MARKDOWN note
 * through the ordinary `createNote`. A `.txt` file becomes a Markdown note
 * too, not a `text` one: `text` is TipTap HTML, where a plain file's line
 * breaks and any `<` in it would be read as markup, while the Markdown
 * editor shows a plain file exactly as written.
 */

export const IMPORT_EXTENSIONS = ['.md', '.markdown', '.txt'];

/** For `<input type="file" accept>`. */
export const IMPORT_ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain';

/**
 * Refused before it is read. The gateway's own ceiling is 100 000
 * characters (saveGuards.js), so anything near a megabyte could never save;
 * the byte cap only stops the page from reading a huge file to find that out.
 */
export const IMPORT_MAX_BYTES = 1024 * 1024;

/** The gateway's title ceiling (notegeek/validation.js `titleSchema`). */
export const TITLE_MAX = 500;

const TEXT_TYPES = new Set(['text/markdown', 'text/x-markdown', 'text/plain']);

const extensionOf = (name) => {
  const m = /\.[^./\\]+$/.exec(String(name || ''));
  return m ? m[0].toLowerCase() : '';
};

/**
 * Can this file become a note? By extension first — Android hands a `.md`
 * over as `application/octet-stream` or with no type at all — then by a
 * text MIME type for a file with no useful name.
 */
export function isImportableFile(file) {
  if (!file) return false;
  if (IMPORT_EXTENSIONS.includes(extensionOf(file.name))) return true;
  return TEXT_TYPES.has(String(file.type || '').toLowerCase());
}

/** `{ accepted, rejected }`, in the order given. */
export function partitionImportFiles(files) {
  const accepted = [];
  const rejected = [];
  for (const f of Array.from(files || [])) (isImportableFile(f) ? accepted : rejected).push(f);
  return { accepted, rejected };
}

/** "Trip notes.md" → "Trip notes". */
export function titleFromFilename(name) {
  const base = String(name || '').split(/[/\\]/).pop();
  const ext = extensionOf(base);
  const stem = (ext && IMPORT_EXTENSIONS.includes(ext) ? base.slice(0, -ext.length) : base).trim();
  return stem || 'Imported note';
}

const clampTitle = (t) => (t.length > TITLE_MAX ? t.slice(0, TITLE_MAX).trimEnd() : t);

/** A YAML front-matter block at the very top, kept as is. */
const FRONT_MATTER = /^---\n[\s\S]*?\n(?:---|\.\.\.)\n/;

/**
 * Title and body for a file's text.
 *
 * The title is the document's opening `# heading` (ATX, or a setext
 * `Title` over `===`) — the first thing in the file, after any front
 * matter — and that heading is taken OUT of the body so the note does not
 * say its title twice. A heading further down is content, not a title: it
 * stays, and the filename names the note.
 *
 * Line endings become `\n`; the text is otherwise untouched.
 *
 * @returns {{ title: string, content: string }}
 */
export function noteFromMarkdown(text, filename) {
  const src = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const fm = FRONT_MATTER.exec(src);
  const head = fm ? fm[0] : '';
  const rest = fm ? src.slice(head.length) : src;

  const lead = /^\s*/.exec(rest)[0];
  const body = rest.slice(lead.length);
  const atx = /^#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/.exec(body);
  const setext = atx ? null : /^([^\n]+)\n=+[ \t]*(?:\n|$)/.exec(body);
  const match = atx || setext;
  const heading = match ? match[1].trim() : '';

  if (!heading) {
    return { title: clampTitle(titleFromFilename(filename)), content: src };
  }
  const after = body.slice(match[0].length).replace(/^\n+/, '');
  // A file that is only a heading keeps it: createNote refuses an empty
  // body (`content` is `min(1)` at the gateway).
  if (!(head + after).trim()) return { title: clampTitle(heading), content: src };
  return { title: clampTitle(heading), content: head + after };
}

export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportError';
  }
}

/**
 * Read one file into `{ title, content }`, or throw an ImportError that says
 * why in the writer's terms (too big, too long, empty). Decoded as UTF-8;
 * a byte order mark is dropped, and bytes that are not UTF-8 become U+FFFD
 * rather than failing the whole file.
 */
export async function readImportFile(file) {
  const name = file?.name || 'That file';
  if (file.size > IMPORT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new ImportError(`${name} is ${mb} MB; a note can hold about 100 KB of text, so it was not imported.`);
  }
  const buf = await file.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  const note = noteFromMarkdown(text, file.name);
  if (!note.content.trim()) {
    throw new ImportError(`${name} is empty.`);
  }
  if (note.content.length > DOC_CONTENT_MAX) {
    throw new ImportError(
      `${name} is too long for one note (${note.content.length.toLocaleString()} of ${DOC_CONTENT_MAX.toLocaleString()} characters).`,
    );
  }
  return note;
}
