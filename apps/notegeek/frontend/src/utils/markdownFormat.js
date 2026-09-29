/**
 * Markdown formatting for a plain textarea: the phone and desktop toolbar
 * buttons in MarkdownEditor. Pure functions over (text, selection) so the
 * edits are tested, not eyeballed. Each returns the new text and where the
 * selection should land.
 *
 * @typedef {{ text: string, start: number, end: number }} Edit
 */

/**
 * Wrap the selection in `before`/`after` (bold, italic, inline code), or
 * unwrap it when it is already wrapped. With nothing selected, insert the
 * pair and put the caret between them.
 *
 * @returns {Edit}
 */
export function toggleWrap(text, start, end, before, after = before) {
  const selected = text.slice(start, end);
  const outerBefore = text.slice(Math.max(0, start - before.length), start);
  const outerAfter = text.slice(end, end + after.length);
  // Already wrapped just outside the selection: unwrap.
  if (outerBefore === before && outerAfter === after) {
    const next = text.slice(0, start - before.length) + selected + text.slice(end + after.length);
    return { text: next, start: start - before.length, end: end - before.length };
  }
  // The selection itself includes the markers: unwrap.
  if (selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length);
    const next = text.slice(0, start) + inner + text.slice(end);
    return { text: next, start, end: start + inner.length };
  }
  const next = text.slice(0, start) + before + selected + after + text.slice(end);
  return { text: next, start: start + before.length, end: end + before.length };
}

/** The [lineStart, lineEnd) span of every line the selection touches. */
function lineSpan(text, start, end) {
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nl = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end);
  const lineEnd = nl === -1 ? text.length : nl;
  return [start === 0 ? 0 : lineStart, lineEnd];
}

const LIST_PREFIX = /^(\s*)(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+\. |> )/;

/**
 * Toggle a line prefix on every touched line: '## ', '- ', '- [ ] ', '> ',
 * '1. '. If every line already has this prefix it comes off; otherwise any
 * other block prefix is replaced by this one (a bullet becomes a checklist
 * item rather than "- - [ ] ").
 *
 * @returns {Edit}
 */
export function toggleLinePrefix(text, start, end, prefix) {
  const [ls, le] = lineSpan(text, start, end);
  const lines = text.slice(ls, le).split('\n');
  const all = lines.every((l) => l.trimStart().startsWith(prefix) || (l.trim() === '' && lines.length > 1));
  let n = 0;
  const out = lines.map((line) => {
    if (line.trim() === '' && lines.length > 1) return line;
    const m = line.match(LIST_PREFIX);
    const indent = m ? m[1] : line.match(/^\s*/)[0];
    const body = m ? line.slice(m[0].length) : line.slice(indent.length);
    if (all) return indent + body;
    n += 1;
    const p = prefix === '1. ' ? `${n}. ` : prefix;
    return indent + p + body;
  });
  const block = out.join('\n');
  const next = text.slice(0, ls) + block + text.slice(le);
  const delta = block.length - (le - ls);
  // One line and no selection: keep the caret at the end of the line's text.
  if (start === end && lines.length === 1) {
    const caret = Math.max(ls, Math.min(ls + block.length, start + delta));
    return { text: next, start: caret, end: caret };
  }
  return { text: next, start: ls, end: ls + block.length };
}

/**
 * A link: the selection becomes the label and the caret lands in the URL
 * slot; with nothing selected, `[](url)` with the caret in the label.
 *
 * @returns {Edit}
 */
export function insertLink(text, start, end) {
  const label = text.slice(start, end);
  if (label) {
    const next = `${text.slice(0, start)}[${label}]()${text.slice(end)}`;
    const caret = start + label.length + 3;
    return { text: next, start: caret, end: caret };
  }
  const next = `${text.slice(0, start)}[]()${text.slice(end)}`;
  return { text: next, start: start + 1, end: start + 1 };
}
