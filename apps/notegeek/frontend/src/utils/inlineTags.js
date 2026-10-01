/**
 * Inline `#tags` — type `#house/garage` in a note's body and, on save, the
 * note is tagged `house/garage`.
 *
 * The token rule and its exclusions (headings, code, URLs and link targets,
 * `C#`, `#1`, hex colours, over-long tags) live in `@geeksuite/tags`
 * (`findTagTokens` / `parseInlineTags`, moved there 2026-10-01 so BuJoGeek's
 * add box reads `#tags` the same way). What is read comes out in the suite
 * standard: `#GeekSuite` tags the note `geek-suite`.
 *
 * Applies to `markdown` and `text` (rich-text HTML) notes only — code, mind
 * maps and sketches have no prose to read. Additive only: deleting the text
 * does not delete the tag; the chip is how a tag is removed.
 */
import { findTagTokens, parseInlineTags, normalizeTag, TAG_MAX_LENGTH, TAGS_MAX } from '@geeksuite/tags';

export { findTagTokens, TAG_MAX_LENGTH, TAGS_MAX };

/** Which note types have inline tags read from their body. */
export const INLINE_TAG_TYPES = new Set(['markdown', 'text']);
export const supportsInlineTags = (type) => INLINE_TAG_TYPES.has(type || 'text');

/**
 * The inline tags in a note body, normalized, in first-seen order, deduped.
 * `markdown` notes are read as Markdown; `text` notes as their TipTap HTML.
 */
export function extractInlineTags(content, type) {
  if (typeof content !== 'string' || !content || !supportsInlineTags(type)) return [];
  return parseInlineTags(content, { format: type === 'markdown' ? 'markdown' : 'html' });
}

/** `geek-s` is a prefix of `geek-suite`; so is `https` of `http-server` (hyphens are word breaks, not typing). */
const isPrefixOf = (short, long) =>
  long !== short && (long.startsWith(short) || long.replace(/-/g, '').startsWith(short.replace(/-/g, '')));

/**
 * The note's tags after a save reads its body.
 *
 * Additive: every inline tag the note does not already carry is appended, up
 * to the gateway's 50. Nothing the user put on the note is taken off. Tags
 * are compared in the suite standard, so `#Work` does not add a second
 * `work`.
 *
 * Two session-only memories keep autosave honest:
 *   - `provisional` — tags THIS session added from the body. Autosave fires
 *     mid-word, so typing `#house/garage` can save `#hou` first. A
 *     provisional tag that has left the body AND is a prefix of an inline tag
 *     that is there now (`hou` → `house`, `house/gar` → `house/garage`,
 *     `geek-s` → `geek-suite`) was a word still being typed, and is taken
 *     back off. Anything else stays.
 *   - `suppressed` — tags the user removed by chip this session. The body is
 *     not allowed to put them straight back.
 *
 * @returns {{ tags: string[], provisional: Set<string>, changed: boolean }}
 */
export function applyInlineTags({ tags, content, type, provisional = new Set(), suppressed = new Set() }) {
  const current = Array.isArray(tags) ? tags : [];
  const nextProvisional = new Set(provisional);
  if (!supportsInlineTags(type)) return { tags: current, provisional: nextProvisional, changed: false };

  const found = extractInlineTags(content, type);
  const foundSet = new Set(found);
  const isPartial = (t) => !foundSet.has(t) && found.some((f) => isPrefixOf(t, f));

  let next = current.filter((t) => {
    if (nextProvisional.has(t) && isPartial(t)) {
      nextProvisional.delete(t);
      return false;
    }
    return true;
  });
  for (const t of nextProvisional) if (!next.includes(t)) nextProvisional.delete(t);

  const key = (t) => normalizeTag(String(t)) || String(t).toLowerCase();
  const have = new Set(next.map(key));
  const blocked = new Set([...suppressed].map(key));
  for (const tag of found) {
    if (next.length >= TAGS_MAX) break;
    if (have.has(tag) || blocked.has(tag)) continue;
    have.add(tag);
    next.push(tag);
    nextProvisional.add(tag);
  }

  const changed = next.length !== current.length || next.some((t, i) => t !== current[i]);
  return { tags: changed ? next : current, provisional: nextProvisional, changed };
}
