/**
 * localStorage that cannot throw. Private windows, blocked site data and
 * quota errors all come back as "nothing stored", which is the right answer
 * for the per-viewer conveniences kept here (grid/list, last sort).
 */
export function readPref(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a convenience, not state */
  }
}
