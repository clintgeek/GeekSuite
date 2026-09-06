import path from "path";

/**
 * The one place that answers "where is the library root" and "is this path
 * still inside it".
 *
 * Every file route in this app builds an absolute path by joining something
 * relative onto `LIBRARY_PATH` — a `Book.files[].path`, a `Book.coverPath`,
 * a filename derived from a request field. `path.join` happily walks out of
 * the root when the relative half contains `..`, and at least one of those
 * relative halves is caller-controlled (the OpenLibrary `coverId` ends up in
 * a filename), so the join has to be checked rather than trusted.
 *
 * `resolveInLibrary()` returns the absolute path when it is still under the
 * root and `null` when it escaped. Callers treat `null` as "no such file"
 * (a read) or a 400 (a write) — never as "close enough".
 */

export function libraryRoot() {
  return process.env.LIBRARY_PATH || "/data/library";
}

/**
 * Resolve `relPath` against the library root, refusing anything that lands
 * outside it. Returns an absolute path, or null.
 */
export function resolveInLibrary(relPath, root = libraryRoot()) {
  if (relPath === null || relPath === undefined) return null;
  const rel = String(relPath);
  if (!rel) return null;
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  if (full === base) return null;
  if (!full.startsWith(base + path.sep)) return null;
  return full;
}

/**
 * Reduce a caller-supplied value to something safe to use as a single path
 * segment: no separators, no leading dots, bounded length.
 */
export function safePathSegment(value, fallback = "file") {
  const cleaned = String(value ?? "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 128);
  return cleaned || fallback;
}

/**
 * Escape a string for safe use inside a MongoDB `$regex`. Without this a
 * search box is both a regex-injection and a ReDoS lever (`(a+)+$`).
 */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default { libraryRoot, resolveInLibrary, safePathSegment, escapeRegex };
