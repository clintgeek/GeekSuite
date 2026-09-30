/**
 * Nested tags — the pure half (no Mongo).
 *
 * A NoteGeek tag is a `/`-separated path, the way Bear does it: `house/garage`
 * is a tag of its own AND sits under `house`. Nothing is stored about the tree
 * itself — it is read off the strings — so the one thing that has to be right
 * is that the strings are always written the same way. `normalizeTag` is that
 * rule, and it is applied on every write path (createNote / updateNote tags,
 * renameTag / deleteTag inputs).
 *
 * A COPY of `normalizeTag` / `normalizeTags` lives in the NoteGeek frontend
 * (`apps/notegeek/frontend/src/utils/tagPath.js`) with the same tests. The
 * frontend does not depend on a shared workspace package today, and adding one
 * for eight lines would drag a lockfile and Dockerfile change along with it.
 * Change one, change both.
 */

/**
 * Trim; split on `/`; trim each segment; drop empty segments; rejoin.
 * `" house // garage/ "` → `house/garage`. Case is kept as typed — `Work`
 * and `work` are different tags, and a case-only rename is a real rename.
 * Non-strings normalize to `''`.
 */
export function normalizeTag(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

/**
 * Normalize every tag, drop the ones that end up empty, and dedupe (exact
 * string) keeping the first occurrence's position.
 */
export function normalizeTags(list) {
  if (!Array.isArray(list)) return list;
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

export const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A Mongo condition on the `tags` array: the tag itself OR anything beneath
 * it. `$in` takes a regex, and an anchored literal prefix can use the `tags`
 * index. `house` never matches `houseboat` — the child test needs the `/`.
 */
export const subtreeCondition = (tag) => ({
  $in: [tag, new RegExp(`^${ escapeRegex(tag) }/`)],
});

/** True when `tag` is `root` or sits beneath it. */
export const isInSubtree = (tag, root) => tag === root || tag.startsWith(`${ root }/`);

/** `house/garage` with `house` → `home` becomes `home/garage`. */
export const swapPrefix = (tag, oldRoot, newRoot) =>
  isInSubtree(tag, oldRoot) ? newRoot + tag.slice(oldRoot.length) : tag;
