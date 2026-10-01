/**
 * remarkWikiLinks — rendered Markdown turns `[[Title]]` / `[[Title|shown]]`
 * into links (DOCS/CONTEXT.md §12).
 *
 *   - resolved (the gateway found the note): a link to `/notes/<id>`,
 *     class `ng-wikilink`
 *   - unresolved (no note has that title yet): a link to a NEW note with that
 *     title, class `ng-wikilink ng-wikilink-missing`, styled quieter (dashed)
 *     and titled "Create …"
 *
 * Options: `{ resolve(key) → noteId | null }`. Like remarkInlineTags it only
 * looks at mdast `text` nodes, so code and existing links are never touched.
 */
import { findWikiLinks, newNoteHref } from './wikiLinks';

const NO_LINKS_INSIDE = new Set(['link', 'linkReference', 'definition', 'code', 'inlineCode', 'html']);

function splitText(node, resolve) {
    const found = findWikiLinks(node.value);
    if (!found.length) return [node];
    const out = [];
    let at = 0;
    for (const link of found) {
        if (link.start > at) out.push({ type: 'text', value: node.value.slice(at, link.start) });
        const id = resolve ? resolve(link.key) : null;
        out.push({
            type: 'link',
            url: id ? `/notes/${ encodeURIComponent(id) }` : newNoteHref(link.title),
            title: id ? null : `Create “${ link.title }”`,
            data: {
                hProperties: {
                    className: id ? ['ng-wikilink'] : ['ng-wikilink', 'ng-wikilink-missing'],
                    'data-wikilink': id ? 'resolved' : 'missing',
                },
            },
            children: [{ type: 'text', value: link.label }],
        });
        at = link.end;
    }
    if (at < node.value.length) out.push({ type: 'text', value: node.value.slice(at) });
    return out;
}

function walk(node, resolve) {
    if (!Array.isArray(node.children) || NO_LINKS_INSIDE.has(node.type)) return;
    const next = [];
    for (const child of node.children) {
        if (child.type === 'text') next.push(...splitText(child, resolve));
        else {
            walk(child, resolve);
            next.push(child);
        }
    }
    node.children = next;
}

export default function remarkWikiLinks(options = {}) {
    const { resolve } = options;
    return (tree) => {
        walk(tree, resolve);
    };
}
