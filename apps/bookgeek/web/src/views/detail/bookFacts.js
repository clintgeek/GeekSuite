/**
 * Shared read-only helpers for the book detail sheet.
 *
 * Pure formatting only — no state, no requests. Every piece of behavior still
 * lives in `App.jsx` and reaches the detail views as props.
 */

/** BookGeek books arrive as `id` from GraphQL and `_id` from REST. */
export function bookId(book) {
  return book?.id || book?._id || null;
}

/** `★★★★☆` for a 0–5 rating, or `null` when the book is unrated. */
export function starsFor(rating) {
  if (typeof rating !== "number" || Number.isNaN(rating) || rating <= 0) return null;
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

/** Does this book have an EPUB the browser reader can open? (App.jsx:904) */
export function hasEpubFile(book) {
  return (
    Array.isArray(book?.files) &&
    book.files.some((file) => {
      const fmt = String(file.format || "").toLowerCase();
      if (fmt === "epub") return true;
      const path = String(file.path || "");
      const ext = path.includes(".") ? path.split(".").pop().toLowerCase() : "";
      return ext === "epub";
    })
  );
}

/** `1.2 MB` / `840 KB` — the size grammar the old download menu used. */
export function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  const mb = size / (1024 * 1024);
  return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${(size / 1024).toFixed(0)} KB`;
}

/** Locale date, or `null` when the value is missing or unparseable. */
export function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

/** Publication year for the hero meta line. */
export function publishedYear(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return String(date.getFullYear());
}

/** The shelf's display label, falling back to the raw id for stale shelves. */
export function shelfLabel(shelves, id) {
  if (!id) return null;
  const found = Array.isArray(shelves) ? shelves.find((s) => s.id === id) : null;
  return found?.label || id;
}

/** The identity color for a shelf; custom shelves share one neutral tone. */
export function shelfColor(theme, id) {
  const shelf = theme.palette.shelf || {};
  return shelf[id] || shelf.custom || theme.palette.text.secondary;
}
