/**
 * Nested tags — the pure half (no Mongo).
 *
 * A NoteGeek tag is a `/`-separated path, the way Bear does it: `house/garage`
 * is a tag of its own AND sits under `house`. Since 2026-10-01 the spelling
 * rule is the suite standard, `@geeksuite/tags` (lowercase kebab-case
 * segments — DOCS/TAG_STANDARD.md), shared with TodoGeek, ThingGeek and the
 * NoteGeek frontend; this file only keeps the names the resolvers and
 * validators already import. `Work` and `work` are now ONE tag, so a
 * case-only rename is a no-op.
 *
 * Reads that filter by tag go through `../shared/tagSpellings.js`, which
 * also finds tags stored before the standard (until the migration runs).
 */
import {
  normalizeTag,
  normalizeTags,
  escapeRegex,
  isUnder,
  swapPrefix,
  subtreeRegex,
} from '@geeksuite/tags';

export { normalizeTag, normalizeTags, escapeRegex, swapPrefix };

/**
 * A Mongo condition on the `tags` array: the tag itself OR anything beneath
 * it, for an already-normalized tag. `house` never matches `houseboat`.
 */
export const subtreeCondition = (tag) => ({ $in: [subtreeRegex(tag)] });

/** True when `tag` is `root` or sits beneath it. */
export const isInSubtree = isUnder;
