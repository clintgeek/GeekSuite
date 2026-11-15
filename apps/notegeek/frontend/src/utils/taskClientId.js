/**
 * The clientId a sketch's journal line carries to TodoGeek (contract C1).
 *
 * `ng:` + the first 32 hex characters of sha-256(`${noteId}|${lineKey}`).
 * Deterministic on purpose: the same line of the same sketch always sends the
 * same id, so a retried request — or a second Send of a line that already
 * went — gets back the task TodoGeek already has instead of a duplicate (the
 * gateway keeps one task per {createdBy, clientId}).
 *
 * Resolves null where Web Crypto is unavailable (an insecure origin); the
 * task is then sent without one, as before.
 */
export async function taskClientId(noteId, lineKey) {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || !noteId || !lineKey) return null;
    const bytes = new TextEncoder().encode(`${noteId}|${lineKey}`);
    const digest = await subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    return `ng:${hex.slice(0, 32)}`;
  } catch {
    return null;
  }
}
