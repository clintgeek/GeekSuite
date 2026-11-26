/**
 * mermaidText.js — a Mermaid diagram's words (node and arrow labels), for the
 * drawn figure's accessible name. A text reading, not a parser.
 *
 * Copied from the gateway's `graphql/notegeek/mermaidCheck.js#mermaidLabels`
 * (which feeds search and list previews): change both.
 */

const HEADER = /^(flowchart|graph)\s+(TD|TB|BT|LR|RL)\s*;?\s*$/;

const unquote = (s) => String(s).trim().replace(/^"(.*)"$/s, '$1').replace(/#quot;/g, '"').trim();

/**
 * @param {string} src  Mermaid source
 * @returns {string[]}  each label once, in the order written
 */
export function mermaidLabels(src) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const label = unquote(raw).replace(/^[/\\]+|[/\\]+$/g, '').replace(/\s+/g, ' ').trim();
    if (label && !seen.has(label)) { seen.add(label); out.push(label); }
  };
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  for (const line of lines) {
    if (HEADER.test(line) || /^(end|direction|classDef|class|style|linkStyle|click)\b/.test(line)) continue;
    const sub = /^subgraph\s+(?:[\w-]+\s*\[\s*("[^"]*"|[^\]]*)\]|("[^"]*"|.+))$/.exec(line);
    if (sub) { add(sub[1] ?? sub[2]); continue; }
    const found = [];
    for (const m of line.matchAll(/\|([^|\n]*)\|/g)) found.push([m.index, m[1]]);
    const masked = line.replace(/\|[^|\n]*\|/g, (m) => ' '.repeat(m.length));
    for (const m of masked.matchAll(/(?:^|\s)--\s+([^-\s][^\n]*?)\s+--[->ox]/g)) found.push([m.index, m[1]]);
    const shapes = /(?<![\w-])\w+\s*(?:\[\[|\[\(|\(\(\(|\(\(|\(\[|\{\{|\[\/|\[\\|\[|\(|\{)\s*("[^"]*"|[^\])}\n]*)/g;
    for (const m of masked.matchAll(shapes)) found.push([m.index, m[1]]);
    found.sort((x, y) => x[0] - y[0]).forEach(([, label]) => add(label));
  }
  return out;
}

/** Text of a hast node and its children. */
const hastText = (n) => (n?.type === 'text' ? n.value : (n?.children || []).map(hastText).join(''));

/**
 * The source of a ```mermaid fence, from react-markdown's `pre` node (its one
 * `code` child carries `language-mermaid`), or null for any other block.
 */
export function mermaidSourceOf(node) {
  const code = node?.children?.find((c) => c?.type === 'element' && c.tagName === 'code');
  const cls = code?.properties?.className;
  const classes = Array.isArray(cls) ? cls : typeof cls === 'string' ? cls.split(/\s+/) : [];
  return classes.includes('language-mermaid') ? hastText(code).replace(/\n$/, '') : null;
}

/** "Diagram: Idea, Good?, yes, Build it" — the figure's accessible name. */
export function diagramLabel(src) {
  const words = mermaidLabels(src);
  return words.length ? `Diagram: ${words.join(', ')}` : 'Diagram';
}

/**
 * A code fence for `source` that nothing inside it can close: one backtick
 * longer than the longest run of backticks in the source, and never under 3.
 */
export function mermaidFence(source) {
  const text = String(source ?? '').replace(/\s+$/, '');
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}mermaid\n${text}\n${fence}`;
}
