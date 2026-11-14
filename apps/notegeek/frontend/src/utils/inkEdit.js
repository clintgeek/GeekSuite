/**
 * Did the user change what is drawn? Shape or asset records, from the user —
 * not the camera, the selection, the paper (document meta) or a snapshot
 * load. Feeds automatic transcription (hooks/useAutoTranscribe.js); saving
 * never depends on it.
 */
export function isInkEdit(entry) {
  if (!entry || entry.source !== 'user') return false;
  const { added = {}, updated = {}, removed = {} } = entry.changes || {};
  return [added, updated, removed].some((set) => Object.keys(set).some((id) => id.startsWith('shape:') || id.startsWith('asset:')));
}
