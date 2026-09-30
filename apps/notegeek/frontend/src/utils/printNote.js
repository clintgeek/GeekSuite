/**
 * printNote.js — Print / Save as PDF (DOCS/CONTEXT.md §8).
 *
 * The browser's own print path, not a PDF library: `window.print()` with a
 * print stylesheet (components/notes/notePrint.css) that hides the app and
 * shows only the note's print rendering (NotePrintView). Android Chrome and
 * the installed PWA offer "Save as PDF" in that dialog; so does desktop.
 *
 * Two things the stylesheet cannot do on its own:
 *
 *   - **The filename.** "Save as PDF" suggests `document.title`, which is
 *     "NoteGeek" all day. It is swapped for the note's title while printing
 *     and put back afterwards (`afterprint`).
 *   - **Anything asynchronous.** A sketch is a tldraw canvas; paper needs it
 *     as an image, and the export takes a moment. `runPrint` awaits the
 *     page's `prepare`, waits for the print view's images to load, and only
 *     then opens the dialog.
 */

export const PRINT_TITLE_FALLBACK = 'Untitled note';

/** Longest wait for images before the dialog opens anyway. */
export const IMAGE_WAIT_MS = 5000;

let savedTitle = null;

/** The name "Save as PDF" should suggest for a note titled `title`. */
export function printTitleFor(title) {
  const t = String(title ?? '').replace(/\s+/g, ' ').trim();
  return t || PRINT_TITLE_FALLBACK;
}

/** Show `title` as the document title until `endPrintTitle`. Idempotent. */
export function beginPrintTitle(title) {
  if (typeof document === 'undefined') return;
  if (savedTitle === null) savedTitle = document.title;
  document.title = printTitleFor(title);
}

/** Put back the title `beginPrintTitle` replaced. Safe to call twice. */
export function endPrintTitle() {
  if (typeof document === 'undefined' || savedTitle === null) return;
  document.title = savedTitle;
  savedTitle = null;
}

const nextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 16);
});

/**
 * Resolve once every `<img>` under `root` has loaded (or failed), or after
 * `timeout`. Two frames first, so a state update that adds images has been
 * committed before they are counted.
 */
export async function waitForImages(root, timeout = IMAGE_WAIT_MS) {
  await nextFrame();
  await nextFrame();
  if (!root) return;
  const pending = [...root.querySelectorAll('img')].filter((img) => !img.complete);
  if (!pending.length) return;
  await Promise.race([
    Promise.all(pending.map((img) => new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }))),
    new Promise((resolve) => setTimeout(resolve, timeout)),
  ]);
}

/**
 * Print the note: title swapped, `prepare` awaited, images loaded, dialog
 * opened. A failing `prepare` does not stop the print — the view is expected
 * to show what it could not render (the sketch view says so in words).
 *
 * `window.print()` blocks on desktop and returns at once on Android, so the
 * title is restored by `afterprint`, not by the line after the call.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {() => Promise<void>} [opts.prepare]
 * @param {() => Element|null} [opts.getRoot]  the print view, for image waits
 */
export async function runPrint({ title, prepare, getRoot } = {}) {
  beginPrintTitle(title);
  const restore = () => {
    window.removeEventListener('afterprint', restore);
    endPrintTitle();
  };
  window.addEventListener('afterprint', restore);
  try {
    if (prepare) await prepare();
  } catch (err) {
    console.warn('NoteGeek print: could not prepare the note', err);
  }
  await waitForImages(getRoot?.() || null);
  window.print();
}

/** Ctrl+P / Cmd+P, and nothing else (not Ctrl+Shift+P, not Alt). */
export function isPrintShortcut(e) {
  return Boolean((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'p');
}

/**
 * A mind map as a nested outline, for paper.
 *
 * The canvas is React Flow, which has no image export of its own, and a
 * screenshot of it would print whatever the camera shows. The outline is
 * the map's actual content: the root, then each node's children in the
 * order they sit on the canvas (top to bottom), recursively. Nodes no edge
 * reaches from the root follow as extra top-level items, so nothing on the
 * canvas is left off the page. Cycles are cut at the second visit.
 *
 * @returns {Array<{ id: string, label: string, children: Array }>}  [] when
 *   the content is not a mind map
 */
export function mindMapOutline(content) {
  let data;
  try {
    data = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return [];
  }
  const nodes = Array.isArray(data?.nodes) ? data.nodes.filter((n) => n && n.id != null) : [];
  if (!nodes.length) return [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const kids = new Map();
  for (const e of edges) {
    const from = String(e?.source);
    const to = String(e?.target);
    if (!byId.has(from) || !byId.has(to)) continue;
    if (!kids.has(from)) kids.set(from, []);
    kids.get(from).push(byId.get(to));
  }
  const y = (n) => n?.position?.y ?? 0;
  const label = (n) => String(n?.data?.label ?? '').trim() || 'Untitled';
  const seen = new Set();
  const build = (n) => {
    const id = String(n.id);
    seen.add(id);
    const children = [];
    for (const c of [...(kids.get(id) || [])].sort((a, b) => y(a) - y(b))) {
      if (!seen.has(String(c.id))) children.push(build(c));
    }
    return { id, label: label(n), children };
  };
  const root = nodes.find((n) => n?.data?.isRoot) || nodes[0];
  const out = [build(root)];
  for (const n of [...nodes].sort((a, b) => y(a) - y(b))) {
    if (!seen.has(String(n.id))) out.push(build(n));
  }
  return out;
}
