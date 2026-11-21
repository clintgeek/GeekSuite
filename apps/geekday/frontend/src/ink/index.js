/**
 * The day page's handwriting canvas and its pure helpers.
 * `InkCanvas` pulls in tldraw; everything else here is tldraw-free.
 */
export { default as InkCanvas, LASSO_EMPTY_HINT, LASSO_TOO_LONG, LASSO_EXPORT_FAILED } from './InkCanvas';
export { INK_TOOLS } from './inkTools';

export {
  sketchHasShapes, sketchExportOptions, exportSketchPng, unionBounds, readableScale, tooLongToRead,
  SketchExportError, LASSO_MIN_SHORT_EDGE, EXPORT_MAX_EDGE, EXPORT_PADDING, TLDRAW_PIXEL_RATIO,
} from './sketchExport';

export {
  pointInPolygon, boundsOfPoints, shapePagePoints, shapeSample, isCircled, selectByLasso,
  distanceToStroke, strokeAtPoint, isTap, lassoSelection, LASSO_INSIDE_SHARE, TAP_TOLERANCE,
} from './lassoGeometry';

export {
  PAGE_WIDTH, SHEET_HEIGHT, RULE_SPACING, MIN_SHEETS, MAX_ZOOM_FACTOR, pageZoom, fitZoom, pageHeightFor, clampCamera,
  panCamera, zoomCamera, fitCamera, cameraAfterResize, isZoomedIn, topOfPage, clientToPage, pageBoxToPane,
} from './pageCamera';
export {
  RULED, PAGE_CHOICES, TEMPLATE_PREF_KEY, readDeviceTemplate, writeDeviceTemplate, storedTemplate, resolveTemplate,
  withTemplate, templateToKeep,
} from './pageTemplate';
export { createInkSaver, SAVE_DEBOUNCE_MS, ECHOES_KEPT } from './inkSaver';
export { readPenSeen, writePenSeen, readFingerDraws, writeFingerDraws, touchDraws, PEN_PREF_KEYS } from './penPrefs';
export { isPalmTouch, PALM_PEN_RECENT_MS, PALM_CONTACT_PX } from './palmTouch';
