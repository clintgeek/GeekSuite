/**
 * The day page's handwriting canvas and its pure helpers.
 * `InkCanvas` pulls in tldraw; everything else here is tldraw-free. The pen
 * helpers shared with NoteGeek (pen button, pen key, two-finger tap, Fine pen,
 * palm rule, lasso geometry, export, snapshot check) are `@geeksuite/ink`.
 */
export { default as InkCanvas, LASSO_EMPTY_HINT, LASSO_TOO_LONG, LASSO_EXPORT_FAILED } from './InkCanvas';
export { INK_TOOLS } from './inkTools';

export {
  PAGE_WIDTH, SHEET_HEIGHT, RULE_SPACING, MIN_SHEETS, MAX_ZOOM_FACTOR, pageZoom, fitZoom, pageHeightFor, clampCamera,
  panCamera, zoomCamera, fitCamera, cameraAfterResize, isZoomedIn, topOfPage, clientToPage, pageBoxToPane,
} from './pageCamera';
export {
  RULED, NO_SHEET, PAPER_CHOICES, SHEET_CHOICES, TEMPLATE_PREF_KEY, SHEET_PREF_KEY, readDevicePaper, writeDevicePaper,
  readDeviceSheet, writeDeviceSheet, storedTemplate, resolvePaper, withPaper, paperToKeep, previewSheet,
} from './pageTemplate';
export { createInkSaver, SAVE_DEBOUNCE_MS, ECHOES_KEPT } from './inkSaver';
export { readPenSeen, writePenSeen, readFingerDraws, writeFingerDraws, PEN_PREF_KEYS } from './penPrefs';
