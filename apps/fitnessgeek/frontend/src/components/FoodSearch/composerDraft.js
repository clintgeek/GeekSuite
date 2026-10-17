/**
 * The add sheet's unsent words, per day and meal (L18).
 *
 * "No signal — Your words are saved here" was only true while the sheet
 * stayed open: the dialog unmounts its children on close, and the words went
 * with them. They are kept in sessionStorage now — this tab only, gone when
 * it closes, never sent anywhere — restored when the same day's same meal is
 * opened again, and cleared once something logs.
 *
 * Every read and write is inside try/catch: a private window, blocked site
 * data or a full quota throws, and then the draft simply isn't kept.
 * `draftsAvailable()` lets the offline line say so instead of promising.
 */
const PREFIX = 'fitnessgeek:composer-draft:';
const keyFor = (day, mealType) => `${PREFIX}${day || 'today'}:${mealType || 'snack'}`;

function storage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readDraft(day, mealType) {
  try {
    return storage()?.getItem(keyFor(day, mealType)) || '';
  } catch {
    return '';
  }
}

export function writeDraft(day, mealType, text) {
  try {
    const store = storage();
    if (!store) return false;
    const value = String(text || '');
    if (value.trim()) store.setItem(keyFor(day, mealType), value);
    else store.removeItem(keyFor(day, mealType));
    return true;
  } catch {
    return false;
  }
}

/** Whether a draft written now would survive closing the sheet. */
export function draftsAvailable() {
  try {
    const store = storage();
    if (!store) return false;
    const probe = `${PREFIX}probe`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Every draft, gone (tests). */
export function forgetDrafts() {
  try {
    const store = storage();
    if (!store) return;
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (key && key.startsWith(PREFIX)) store.removeItem(key);
    }
  } catch {
    // Nothing kept, nothing to clear.
  }
}
