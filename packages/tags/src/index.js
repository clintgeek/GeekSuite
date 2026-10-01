/**
 * @geeksuite/tags — the suite tag standard (lowercase kebab-case segments,
 * `/` for nesting). Pure ESM, no runtime dependencies; the gateway (Node) and
 * the NoteGeek / BuJoGeek / ThingGeek frontends (Vite) import the same file.
 * The rules are written out in `normalize.js` (and, for people, in
 * `DOCS/TAG_STANDARD.md`).
 */
export {
  TAG_MAX_LENGTH,
  TAGS_MAX,
  normalizeSegment,
  normalizeTag,
  normalizeTags,
  isNormalizedTag,
  escapeRegex,
  isUnder,
  isDescendant,
  swapPrefix,
  parentTag,
  subtreeRegex,
} from './normalize.js';
export { findTagTokens, parseInlineTags, markdownProse, htmlProse } from './inline.js';
export { tagTree, filterTagTree } from './tree.js';
