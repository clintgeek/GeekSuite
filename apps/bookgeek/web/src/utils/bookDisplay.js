/**
 * Pure display helpers shared by the BookGeek views.
 *
 * Extracted from App.jsx unchanged so the library grid, the book detail modal
 * and the app shell all read the same API base and the same cover/description
 * formatting.
 */

/**
 * Origin for the REST that legitimately stays on bookgeek's own API — file
 * upload/download, covers, metadata enrich, merge, imports and device baskets.
 * Pure data moved to basegeek's gateway (see `../graphql/`).
 *
 * The suite convention (notegeek, storygeek): `VITE_API_URL` from
 * `vite.config.js`, falling back to the same-origin `/api`. In production the
 * bookgeek container serves the built SPA and the API from one origin
 * (`bookgeek.clintgeek.com`, port 1800), so `/api` is right; in dev the vite
 * server proxies `/api` to `http://localhost:1800`. Nothing hardcodes a host.
 */
export const API_BASE = import.meta.env?.VITE_API_URL || "/api";

export function decodeBasicHtmlEntities(input) {
  if (typeof input !== "string") return "";
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function formatDescriptionForDisplay(raw) {
  if (typeof raw !== "string") return "";
  let text = raw;
  const looksHtml = /<\s*\/?\s*[a-z][^>]*>/i.test(text);
  if (looksHtml) {
    text = text
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
      .replace(/<\s*p\b[^>]*>/gi, "")
      .replace(/<\s*\/\s*li\s*>/gi, "\n")
      .replace(/<\s*li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "");
  }
  text = decodeBasicHtmlEntities(text);
  text = text.replace(/\r\n?/g, "\n");
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

export function getCoverUrl(book) {
  if (!book || !(book.id || book._id)) return null;
  const base = `${ API_BASE }/books/${ (book.id || book._id) }/cover`;
  const ts =
    (typeof book.updatedAt === "string" && book.updatedAt) ||
    (typeof book.updatedAt === "number" && book.updatedAt) ||
    (typeof book.createdAt === "string" && book.createdAt) ||
    (typeof book.createdAt === "number" && book.createdAt) ||
    Date.now();
  return `${ base }?v=${ encodeURIComponent(ts) }`;
}
