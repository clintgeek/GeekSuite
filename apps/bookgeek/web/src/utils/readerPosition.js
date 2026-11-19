/**
 * Where you were in a book, remembered ON THIS DEVICE ONLY (review
 * 2026-11-18 #1). Position sync through the server stays ruled out (S-D3);
 * this is the cheap half: localStorage, keyed by reader and book, so Heather
 * and Chef on one tablet each reopen at their own page.
 *
 * Also the cache of epub.js's generated locations per book, so the
 * percentage is worked out once per device rather than on every open.
 *
 * Every storage access is in try/catch: a private window, blocked site data
 * or a full quota only means "start at the cover" / "generate again", never a
 * broken reader.
 */
export const READER_POSITIONS_KEY = "bookgeek.reader.positions.v1";
export const READER_LOCATIONS_PREFIX = "bookgeek.reader.locations.v1.";
const READER_LOCATIONS_INDEX = "bookgeek.reader.locations.v1:index";

/** Positions are tiny; keep plenty. Locations are big (a CFI per ~1600 chars). */
export const MAX_POSITIONS = 200;
export const MAX_CACHED_LOCATIONS = 12;

/** Who is reading, as a storage key part: the signed-in user's id. */
export function readerKeyFor(user) {
  const key = user?.id || user?._id || user?.userId || user?.username || user?.email;
  return key ? String(key) : null;
}

const positionKey = (readerId, bookId) => `${readerId || "anon"}:${bookId}`;

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** The saved CFI for this reader and book, or null. */
export function loadReaderPosition(readerId, bookId) {
  if (!bookId) return null;
  const all = readJson(READER_POSITIONS_KEY, {});
  const entry = all[positionKey(readerId, bookId)];
  return entry && typeof entry.cfi === "string" && entry.cfi.startsWith("epubcfi(") ? entry.cfi : null;
}

/** Remember `cfi` for this reader and book; the oldest entries fall off past MAX_POSITIONS. */
export function saveReaderPosition(readerId, bookId, cfi, now = Date.now()) {
  if (!bookId || typeof cfi !== "string" || !cfi.startsWith("epubcfi(")) return;
  const all = readJson(READER_POSITIONS_KEY, {});
  all[positionKey(readerId, bookId)] = { cfi, at: now };
  const keys = Object.keys(all);
  if (keys.length > MAX_POSITIONS) {
    keys
      .sort((a, b) => (all[a]?.at || 0) - (all[b]?.at || 0))
      .slice(0, keys.length - MAX_POSITIONS)
      .forEach((k) => delete all[k]);
  }
  writeJson(READER_POSITIONS_KEY, all);
}

/** epub.js's saved locations (a JSON string) for this book, or null. */
export function loadCachedLocations(bookId) {
  if (!bookId) return null;
  try {
    const raw = window.localStorage.getItem(READER_LOCATIONS_PREFIX + bookId);
    return typeof raw === "string" && raw.startsWith("[") ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Cache `json` (epub.js `locations.save()`) for this book, keeping only the
 * MAX_CACHED_LOCATIONS most recent books. A full quota drops the oldest and
 * tries once more, then gives up quietly.
 */
export function saveCachedLocations(bookId, json) {
  if (!bookId || typeof json !== "string") return;
  try {
    const index = readJson(READER_LOCATIONS_INDEX, { ids: [] });
    const ids = Array.isArray(index.ids) ? index.ids.filter((id) => id !== bookId) : [];
    ids.push(bookId);
    while (ids.length > MAX_CACHED_LOCATIONS) {
      window.localStorage.removeItem(READER_LOCATIONS_PREFIX + ids.shift());
    }
    try {
      window.localStorage.setItem(READER_LOCATIONS_PREFIX + bookId, json);
    } catch {
      if (ids.length > 1) {
        window.localStorage.removeItem(READER_LOCATIONS_PREFIX + ids.shift());
        window.localStorage.setItem(READER_LOCATIONS_PREFIX + bookId, json);
      } else {
        throw new Error("no room");
      }
    }
    writeJson(READER_LOCATIONS_INDEX, { ids });
  } catch {
    // no room or no storage: the next open generates them again
  }
}

/**
 * The table of contents flattened to `{ label, href, depth }`, in book order
 * (epub.js `navigation.toc` nests chapters under parts).
 */
export function flattenToc(toc, depth = 0, out = []) {
  if (!Array.isArray(toc)) return out;
  for (const item of toc) {
    if (!item) continue;
    const label = String(item.label || "").trim();
    if (label && item.href) out.push({ id: item.id || `${item.href}-${out.length}`, label, href: item.href, depth });
    if (Array.isArray(item.subitems) && item.subitems.length) flattenToc(item.subitems, depth + 1, out);
  }
  return out;
}

const stripFragment = (href) => String(href || "").split("#")[0];

/**
 * The chapter a spine href belongs to: the first flattened TOC entry whose
 * file is that href. Hrefs are compared without the fragment and by suffix,
 * since a nav document may write "Text/ch1.xhtml" where the spine says
 * "OEBPS/Text/ch1.xhtml" or the reverse.
 */
export function chapterForHref(flatToc, href) {
  const target = stripFragment(href);
  if (!target || !Array.isArray(flatToc)) return null;
  const same = (a) => {
    const file = stripFragment(a);
    return Boolean(file) && (file === target || target.endsWith(`/${file}`) || file.endsWith(`/${target}`));
  };
  let match = null;
  for (const item of flatToc) {
    if (same(item.href)) {
      // The first entry for the file is the chapter; later ones are its sections.
      if (!match) match = item;
    }
  }
  return match ? match.label : null;
}
