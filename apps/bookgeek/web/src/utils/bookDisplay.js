/**
 * Pure display helpers shared by the BookGeek views.
 *
 * Extracted from App.jsx unchanged so the library grid, the book detail modal
 * and the app shell all read the same API base and the same cover/description
 * formatting.
 */

export let API_BASE = "http://localhost:1800/api";

if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  const origin = window.location.origin.replace(/\/$/, "");
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    API_BASE = `${ origin }/api`;
  }
}

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
