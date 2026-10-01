/**
 * Nested tags — the path rules, shared by every tag surface in the app.
 *
 * A tag is a `/`-separated path, the way Bear does it: `house/garage` is a
 * tag of its own AND sits under `house`. Nothing about the tree is stored; it
 * is read off the strings, so they must always be spelled the same way.
 *
 * Since 2026-10-01 that spelling is the suite standard, `@geeksuite/tags`
 * (lowercase kebab-case segments — DOCS/TAG_STANDARD.md), the same package
 * the gateway normalizes every write with. `GeekSuite`, `geek suite` and
 * `geek_suite` are all `geek-suite`; `Work` and `work` are one tag. The path
 * helpers come from there too; what is left here is NoteGeek's own wording
 * and layout.
 */
import {
  normalizeTag,
  normalizeTags,
  isUnder,
  isDescendant,
  swapPrefix,
  parentTag,
} from '@geeksuite/tags';

export { normalizeTag, normalizeTags, isDescendant, swapPrefix, parentTag };

/** True when `tag` is `root` or sits beneath it. `house` ∌ `houseboat`. */
export const isInSubtree = isUnder;

/**
 * Why a rename/move can't go ahead, in the user's words — or null. Mirrors
 * the gateway's refusal (resolvers.js renameTag): nothing moves inside itself.
 */
export function renameProblem(fromTag, rawNext) {
  const next = normalizeTag(rawNext);
  if (!next) return 'A tag needs a name.';
  if (next !== fromTag && isInSubtree(next, fromTag)) {
    return `#${fromTag} can't move inside itself.`;
  }
  return null;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The delete dialog's sentence, from `noteTagUsage`:
 * "Removes #house and its 2 sub-tags from 7 notes. The notes stay."
 */
export function deleteSummary(tag, usage) {
  if (!usage) return `Removes #${tag} and any sub-tags from your notes. The notes stay.`;
  const { notes, subTags } = usage;
  const what = subTags > 0 ? `#${tag} and its ${plural(subTags, 'sub-tag', 'sub-tags')}` : `#${tag}`;
  return `Removes ${what} from ${plural(notes, 'note', 'notes')}. The notes stay.`;
}

/** The route for a tag's view. */
export const tagHref = (tag) => `/tags/${encodeURIComponent(tag)}`;

/**
 * How a note row names its tags while a tag view is open.
 *
 * Inside `house`, a note tagged `house/garage` reads `garage`, one tagged
 * `house/garage/door` reads `garage/door` — the part the header doesn't
 * already say — and those come first. The viewed tag itself is dropped (the
 * header names it). Tags outside the subtree follow, by their last segment,
 * as everywhere else. Without a `context`, every tag is its last segment.
 */
export function rowTagLabels(tags, context = null) {
  const list = Array.isArray(tags) ? tags.filter((t) => typeof t === 'string' && t) : [];
  const last = (t) => t.split('/').pop();
  if (!context) return list.map(last);
  const inside = list
    .filter((t) => isDescendant(t, context))
    .map((t) => t.slice(context.length + 1));
  const outside = list.filter((t) => !isInSubtree(t, context)).map(last);
  return [...inside, ...outside];
}

// ── The tag picker (TagSelector.jsx) ──────────────────────────────────────

/**
 * What the typed text asks for, spelled like a stored tag — but keeping a
 * trailing `/`, which means "the children of": `House / ` → `house/`.
 */
export function tagQuery(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  const q = normalizeTag(raw);
  return q && raw.endsWith('/') ? `${q}/` : q;
}

/**
 * Options for the typed text, read in the suite standard: every existing
 * tag PATH containing it, the ones that start with it first — so `house/`
 * lists `house/garage`, `house/kitchen` straight away, and `GeekS` finds
 * `geek-suite`. Hyphens are where the standard put word breaks, not
 * something the user typed, so `geeks` finds `geek-suite` too.
 */
export function filterTagOptions(options, inputValue) {
  const q = tagQuery(inputValue);
  if (!q) return options;
  const bare = (s) => s.replace(/-/g, '');
  const qBare = bare(q);
  const text = (o) => normalizeTag(String(o)) || String(o).toLowerCase();
  const matches = (o) => text(o).includes(q) || bare(text(o)).includes(qBare);
  const startsWith = (o) => text(o).startsWith(q) || bare(text(o)).startsWith(qBare);
  const hits = options.filter(matches);
  return [...hits.filter(startsWith), ...hits.filter((o) => !startsWith(o))];
}
