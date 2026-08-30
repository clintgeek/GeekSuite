import crypto from "crypto";
import { WORDS } from "./wordlist.js";

/**
 * generateSlug(wordCount = 4)
 * Picks `wordCount` words using crypto.randomInt (CSPRNG), joins with "-".
 * Returns a lowercase hyphen-separated string, e.g. "soft-apple-chair-lamp".
 */
export function generateSlug(wordCount = 4) {
  const parts = [];
  for (let i = 0; i < wordCount; i++) {
    parts.push(WORDS[crypto.randomInt(WORDS.length)]);
  }
  return parts.join("-");
}

/**
 * normalizeSlug(input)
 * Trims, lowercases, and collapses any run of whitespace or underscores to a
 * single hyphen. Suitable for case-insensitive slug lookup.
 */
export function normalizeSlug(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}
