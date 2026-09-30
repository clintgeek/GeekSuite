/**
 * remarkInlineTags — a remark plugin that turns inline `#tags` in rendered
 * Markdown into links to their tag page (`/tags/house%2Fgarage`).
 *
 * It uses the same token rule as the save path (`findTagTokens` in
 * inlineTags.js), and it only ever looks at mdast `text` nodes, so code
 * (`code` / `inlineCode` nodes), link targets and headings' `#` markers are
 * never touched — Markdown has already parsed them away. Text already inside
 * a link is left alone too: a link inside a link is not a thing.
 *
 * A text node that follows an inline node (`**bold**#x`) does not start at a
 * boundary, so a hash at its very start is not a tag — the same answer the
 * save path gives for the raw text.
 */
import { findTagTokens } from './inlineTags';
import { tagHref } from './tagPath';

const NO_TAGS_INSIDE = new Set(['link', 'linkReference', 'definition', 'code', 'inlineCode', 'html']);

function startsAtBoundary(prev) {
  if (!prev) return true;
  if (prev.type === 'break') return true;
  if (prev.type === 'text') return /[\s(]$/.test(prev.value);
  return false;
}

function splitText(node, atStart) {
  const tokens = findTagTokens(node.value, { atStart });
  if (tokens.length === 0) return [node];
  const out = [];
  let at = 0;
  for (const { tag, start, end } of tokens) {
    if (start > at) out.push({ type: 'text', value: node.value.slice(at, start) });
    out.push({
      type: 'link',
      url: tagHref(tag),
      title: null,
      data: { hProperties: { className: ['ng-inline-tag'], 'data-tag': tag } },
      children: [{ type: 'text', value: node.value.slice(start, end) }],
    });
    at = end;
  }
  if (at < node.value.length) out.push({ type: 'text', value: node.value.slice(at) });
  return out;
}

function walk(node) {
  if (!Array.isArray(node.children) || NO_TAGS_INSIDE.has(node.type)) return;
  const original = node.children;
  const next = [];
  original.forEach((child, i) => {
    if (child.type === 'text') {
      next.push(...splitText(child, startsAtBoundary(original[i - 1])));
    } else {
      walk(child);
      next.push(child);
    }
  });
  node.children = next;
}

export default function remarkInlineTags() {
  return (tree) => {
    walk(tree);
  };
}
