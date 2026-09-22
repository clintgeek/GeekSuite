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
/**
 * A reading date — `dateFinished` / `dateStarted` — shown on the right day.
 *
 * The gateway declares these instants (`instantField`), and the app may one
 * day write a real one ("finished just now", 9 PM local). But every such date
 * in the live library on 2026-09-22 — all 90 — sat at exactly UTC midnight:
 * calendar dates from the Goodreads import. `formatDate` read those in local
 * time and showed every finish date a day early west of UTC, and a month early
 * for the 18 finished on the 1st.
 *
 * So the value decides: exactly UTC midnight is a calendar date and is read in
 * UTC; anything else is an instant and is read in the viewer's timezone. A
 * genuine instant landing on 00:00:00.000 UTC is a one-in-86-million accident.
 *
 * @param {Intl.DateTimeFormatOptions} [options] e.g. `{ month: 'short', year: 'numeric' }`
 */
export function formatReadingDate(value, options) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const isCalendarDay =
    date.getUTCHours() === 0 && date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  return date.toLocaleDateString(undefined, {
    ...options,
    ...(isCalendarDay ? { timeZone: "UTC" } : null),
  });
}

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

/**
 * Locale date for an **instant** — `dateAdded`, which is when the record was
 * created. Do NOT use this for `publishedDate` (see `formatCalendarDate`) or
 * for the reading dates `dateFinished`/`dateStarted` (see `formatReadingDate`):
 * those were listed here once, and all 90 live finish dates are UTC-midnight
 * calendar days that this showed a day early.
 */
export function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

/**
 * Locale date for a **calendar day** — `publishedDate`, which the gateway
 * stores at UTC midnight (`historicalDateField` → `toUtcMidnight`). Rendered
 * with the local timezone it lands a day early everywhere west of UTC: on
 * this box, *Dune*'s `1965-01-01` read "12/31/1964". Reading it back in UTC
 * is the whole fix.
 *
 * Mirrors `displayCalendarDate` from `@geeksuite/utils/dates`, which this app
 * does not (yet) depend on.
 */
export function formatCalendarDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { timeZone: "UTC" });
}

/** Publication year for the hero meta line — a calendar date, so read in UTC. */
export function publishedYear(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return String(date.getUTCFullYear());
}

/**
 * The stable key for one cover-search candidate.
 *
 * `App.jsx` (which tracks which candidate is being applied) and `CoverTools`
 * (which renders the grid and its spinner) used to compute this separately
 * and disagree: for a Google Books candidate with no string `id`, CoverTools
 * produced the constant `"cover-"` — a duplicate React key across every such
 * candidate, and a spinner that never matched. One function, both callers.
 */
export function coverCandidateKey(candidate) {
  if (!candidate) return "cover-";
  if (typeof candidate.id === "string" && candidate.id) return candidate.id;
  if (candidate.source === "openlibrary") {
    return `cover-${candidate.coverId ?? candidate.id ?? ""}`;
  }
  return `cover-${candidate.coverUrl || candidate.largeUrl || candidate.thumbUrl || ""}`;
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
