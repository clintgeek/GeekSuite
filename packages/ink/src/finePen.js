/**
 * finePen.js — the Fine pen for sketches.
 *
 * "Fine" is finer than tldraw's smallest size (Chef, 2026-09-27: "can we
 * make that thin writing line even thinner?"). tldraw's stroke widths
 * (STROKE_SIZES) are private, so Fine is size 's' drawn at a reduced
 * per-shape `scale`: new draw strokes get it from a before-create side effect
 * (fineStrokeHandler), and nothing already drawn changes.
 *
 * Exports need no help: DrawShapeUtil.toSvg wraps a stroke in
 * `scale(1/scale)`, but getSvgJsx adds `scale(props.scale)` to the shape's
 * page transform, and the two cancel. Checked in a real browser on
 * 2026-09-27: a Fine stroke exports at exactly its on-canvas size.
 */
export const FINE_SCALE = 0.5;

/**
 * Before-create side effect: while the Fine pen is chosen, a stroke the
 * writer starts with the draw tool at size 's' gets FINE_SCALE.
 *
 * It SETS the scale rather than multiplying it. A long stroke is split into
 * a new shape every `maxPointsPerDrawShape` points, and tldraw copies the
 * previous shape's (already Fine) scale onto it (Drawing.ts); multiplying
 * would halve it again mid-stroke. `fresh` is the scale tldraw itself gives a
 * new stroke (1, or 1/zoom in dynamic-size mode).
 *
 * Only a stroke being drawn RIGHT NOW: the draw tool in its `drawing` state
 * (tldraw sets that state before its onEnter creates the shape), holding a
 * single point, as tldraw starts every stroke. That is what keeps every
 * stroke already on the page at its own scale. Loading a sketch DOES run this
 * handler in 2.4.6 — `loadStoreSnapshot` turns side effects off, but the
 * `atomic()` inside it defaults `runCallbacks` to true and turns them back
 * on — and an earlier version keyed on "the draw tool is active" rescaled
 * every saved Small stroke on open (found in a real-browser export,
 * 2026-09-27). A paste or duplicate is not `draw.drawing` either, so copies
 * keep the scale they were copied with.
 *
 * Only 'draw': the highlighter is not the pen, and a Fine highlighter is not
 * a thing anyone asked for.
 */
export const fineStrokeHandler = (editor, fineRef) => (shape, source) => {
    if (source !== 'user' || !fineRef.current) return shape;
    if (shape.type !== 'draw' || shape.props?.size !== 's') return shape;
    if (!editor.isIn('draw.drawing')) return shape;
    const segments = shape.props.segments || [];
    if (segments.length !== 1 || (segments[0].points || []).length !== 1) return shape;
    const fresh = editor.user.getIsDynamicResizeMode?.() ? 1 / editor.getZoomLevel() : 1;
    return { ...shape, props: { ...shape.props, scale: fresh * FINE_SCALE } };
};
