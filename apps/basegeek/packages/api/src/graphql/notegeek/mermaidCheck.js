/**
 * mermaidCheck.js — is this text a Mermaid flowchart we are willing to hand
 * back? (apps/notegeek/DOCS/HANDWRITING.md, "Turn into a diagram").
 *
 * A text check, not a parser: the gateway cannot run Mermaid (it needs a DOM).
 * The client's `mermaid.parse` is the real validation; this catches what a
 * model gets wrong most often, and anything that must never reach a page, so
 * the one automatic retry is spent on something worth retrying.
 *
 * Also `mermaidLabels`: the words of a diagram (node and arrow labels), which
 * noteDerived.js uses for a note's search text and list preview instead of the
 * Mermaid syntax. Copied in the NoteGeek client as
 * `frontend/src/utils/mermaidText.js` (the figure's accessible name): change both.
 *
 * Pure: no Mongo, no network, nothing from the AI stack (noteDerived.js
 * imports it, and the privacy test walks that graph).
 */

/** Longer than any page a person draws by hand; a runaway answer is longer. */
export const MERMAID_MAX_CHARS = 8000;
/** Distinct nodes. A dense hand-drawn page has a few dozen. */
export const MERMAID_MAX_NODES = 150;

export const MERMAID_HEADER = /^(flowchart|graph)\s+(TD|TB|BT|LR|RL)\s*;?\s*$/;

const OPENERS = { '[': ']', '(': ')', '{': '}' };
const CLOSERS = new Set([']', ')', '}']);
const KEYWORD = /^(subgraph|end|direction|classDef|class|style|linkStyle)\b/;
const ARROW = /\s*(?:<?-{2,}[->ox]?|<?={2,}[=>ox]?|<?-\.+->?|~~~|&)\s*/;

/** The text with every "quoted string" replaced by a placeholder. */
const withoutQuoted = (line) => line.replace(/"[^"\n]*"/g, '""');

/** Statement lines: no header, no blank lines, no %% comments. */
function statements(src) {
  return String(src).replace(/\r\n?/g, '\n').split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
}

/** Whether brackets and quotes on a line pair up (outside quotes). '' or a problem. */
function lineBalance(line) {
  if ((line.match(/"/g) || []).length % 2) return 'a label has an unclosed double quote';
  const bare = withoutQuoted(line).replace(/\|[^|\n]*\|/g, '||');
  if ((bare.match(/\|/g) || []).length % 2) return 'an arrow label has an unclosed |';
  const stack = [];
  for (const ch of bare) {
    if (OPENERS[ch]) stack.push(OPENERS[ch]);
    else if (CLOSERS.has(ch)) {
      if (stack.pop() !== ch) return `brackets do not match on the line "${line.slice(0, 60)}"`;
    }
  }
  return stack.length ? `a bracket is not closed on the line "${line.slice(0, 60)}"` : '';
}

/** The node ids a statement line names. */
function idsOn(line) {
  if (KEYWORD.test(line)) return [];
  // Labels out: quoted strings, |arrow labels|, and whatever sits in a shape.
  let bare = withoutQuoted(line).replace(/\|[^|\n]*\|/g, ' ');
  let prev;
  do {
    prev = bare;
    bare = bare.replace(/[[({][^[\](){}]*[\])}]/g, '');
  } while (bare !== prev);
  return bare.split(ARROW).map((t) => t.trim().replace(/;$/, '').replace(/:::\w+$/, ''))
    .filter((t) => /^[\w-]+$/.test(t));
}

/**
 * Check a model's answer.
 * @param {string} src
 * @returns {{ ok: true } | { ok: false, problem: string }}  `problem` is
 *   written to be sent back to the model as-is.
 */
export function checkMermaid(src) {
  const text = String(src ?? '').trim();
  if (!text) return { ok: false, problem: 'the answer was empty' };
  if (text.length > MERMAID_MAX_CHARS) return { ok: false, problem: `the diagram is longer than ${MERMAID_MAX_CHARS} characters` };
  if (text.includes('%%{')) return { ok: false, problem: 'it contains a %%{ directive; directives are not allowed' };
  if (/javascript:/i.test(text)) return { ok: false, problem: 'it contains "javascript:"' };
  // HTML is refused; an arrow's own "<" (<-->, <==>) is not HTML.
  if (/<[A-Za-z/!?]/.test(text)) return { ok: false, problem: 'it contains HTML; labels must be plain words' };
  const lines = statements(text);
  if (!MERMAID_HEADER.test(lines[0] || '')) {
    return { ok: false, problem: 'the first line must be "flowchart TD" or "flowchart LR"' };
  }
  const ids = new Set();
  for (const line of lines.slice(1)) {
    const bare = withoutQuoted(line);
    if (/\bclick\b/i.test(bare)) return { ok: false, problem: 'it contains a click statement; links are not allowed' };
    if (/\bhref\b/i.test(bare)) return { ok: false, problem: 'it contains href; links are not allowed' };
    const unbalanced = lineBalance(line);
    if (unbalanced) return { ok: false, problem: unbalanced };
    for (const id of idsOn(line)) ids.add(id);
  }
  if (ids.size === 0) return { ok: false, problem: 'the diagram has no nodes' };
  if (ids.size > MERMAID_MAX_NODES) return { ok: false, problem: `the diagram has more than ${MERMAID_MAX_NODES} nodes` };
  return { ok: true };
}

const unquote = (s) => String(s).trim().replace(/^"(.*)"$/s, '$1').replace(/#quot;/g, '"').trim();

/**
 * A diagram's words, in the order written: each node's label once, then each
 * arrow label. Node ids are not words and are left out (a node with no label
 * contributes nothing). Tolerant: anything it does not recognise is skipped.
 * @param {string} src  Mermaid source
 * @returns {string[]}
 */
export function mermaidLabels(src) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const label = unquote(raw).replace(/^[/\\]+|[/\\]+$/g, '').replace(/\s+/g, ' ').trim();
    if (label && !seen.has(label)) { seen.add(label); out.push(label); }
  };
  for (const line of statements(src)) {
    if (MERMAID_HEADER.test(line) || /^(end|direction|classDef|class|style|linkStyle|click)\b/.test(line)) continue;
    const sub = /^subgraph\s+(?:[\w-]+\s*\[\s*("[^"]*"|[^\]]*)\]|("[^"]*"|.+))$/.exec(line);
    if (sub) { add(sub[1] ?? sub[2]); continue; }
    // Labels in the order they stand on the line. Arrow labels: -->|text|
    // and -- text -->. Node labels: id["..."], id[...], id(...), id((...)),
    // id{...}, id{{...}}, id[(...)].
    const found = [];
    for (const m of line.matchAll(/\|([^|\n]*)\|/g)) found.push([m.index, m[1]]);
    const masked = line.replace(/\|[^|\n]*\|/g, (m) => ' '.repeat(m.length));
    for (const m of masked.matchAll(/(?:^|\s)--\s+([^-\s][^\n]*?)\s+--[->ox]/g)) found.push([m.index, m[1]]);
    const shapes = /(?<![\w-])\w+\s*(?:\[\[|\[\(|\(\(\(|\(\(|\(\[|\{\{|\[\/|\[\\|\[|\(|\{)\s*("[^"]*"|[^\]\)\}\n]*)/g;
    for (const m of masked.matchAll(shapes)) found.push([m.index, m[1]]);
    found.sort((x, y) => x[0] - y[0]).forEach(([, label]) => add(label));
  }
  return out;
}
