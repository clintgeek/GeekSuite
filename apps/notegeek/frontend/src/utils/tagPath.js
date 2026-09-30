/**
 * Nested tags — the path rules, shared by every tag surface in the app.
 *
 * A tag is a `/`-separated path, the way Bear does it: `house/garage` is a
 * tag of its own AND sits under `house`. Nothing about the tree is stored; it
 * is read off the strings, so they must always be spelled the same way.
 *
 * `normalizeTag` / `normalizeTags` are a COPY of the gateway's
 * (`apps/basegeek/packages/api/src/graphql/notegeek/tags.js`), which applies
 * them to every write. The UI applies them too so a chip shows what will be
 * stored. Change one, change both — the tests are the same cases.
 */

/**
 * Trim; split on `/`; trim each segment; drop empty segments; rejoin.
 * `" house // garage/ "` → `house/garage`. Case is kept — `Work` and `work`
 * are different tags. Non-strings normalize to `''`.
 */
export function normalizeTag(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

/** Normalize, drop empties, dedupe (exact) keeping the first position. */
export function normalizeTags(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** True when `tag` is `root` or sits beneath it. `house` ∌ `houseboat`. */
export const isInSubtree = (tag, root) =>
  typeof tag === 'string' && !!root && (tag === root || tag.startsWith(`${root}/`));

/** True when `tag` sits strictly beneath `root`. */
export const isDescendant = (tag, root) => isInSubtree(tag, root) && tag !== root;

/** `house/garage` with `house` → `home` becomes `home/garage`. */
export const swapPrefix = (tag, oldRoot, newRoot) =>
  isInSubtree(tag, oldRoot) ? newRoot + tag.slice(oldRoot.length) : tag;

/** `house/garage` → `house`; a top-level tag → `''`. */
export const parentTag = (tag) => {
  const i = typeof tag === 'string' ? tag.lastIndexOf('/') : -1;
  return i === -1 ? '' : tag.slice(0, i);
};

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
 * trailing `/`, which means "the children of": `house / ` → `house/`.
 */
export function tagQuery(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  const q = normalizeTag(raw);
  return q && raw.endsWith('/') ? `${q}/` : q;
}

/**
 * Options for the typed text: every existing tag PATH containing it
 * (case-insensitive), the ones that start with it first — so `house/` lists
 * `house/garage`, `house/kitchen` straight away.
 */
export function filterTagOptions(options, inputValue) {
  const q = tagQuery(inputValue).toLowerCase();
  if (!q) return options;
  const hits = options.filter((o) => String(o).toLowerCase().includes(q));
  const starts = hits.filter((o) => String(o).toLowerCase().startsWith(q));
  const rest = hits.filter((o) => !String(o).toLowerCase().startsWith(q));
  return [...starts, ...rest];
}
