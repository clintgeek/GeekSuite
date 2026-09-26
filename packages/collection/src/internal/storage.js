/**
 * Web storage that cannot throw. Private windows, blocked site data and quota
 * errors all come back as "nothing stored" — the right answer for the
 * per-viewer conveniences kept here (open sections, scroll positions).
 */
export function readPref(key, fallback, storage = 'localStorage') {
  try {
    const raw = window[storage].getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePref(key, value, storage = 'localStorage') {
  try {
    window[storage].setItem(key, JSON.stringify(value));
  } catch {
    /* a convenience, not state */
  }
}
