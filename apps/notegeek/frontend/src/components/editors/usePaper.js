/** The sketch paper's hook and setters (model in paperModel.js, components in Paper.jsx). */
import { useTheme } from '@mui/material';
import { useEditor, useValue } from '@tldraw/tldraw';
import { isPaperSheetShape, paperSheetOf, paperSheetTemplateOf, placePaperSheet, removePaperSheet } from '@geeksuite/ui';
import {
    paperFromMeta, readDevicePaper, resolvePaper, sheetPlacement, sheetViewBox, writeDevicePaper,
} from './paperModel';

/**
 * The sketch's paper, resolved for painting, and its template: the id of the
 * sheet printed into the drawing, or null when there is none.
 */
export function usePaper() {
    const editor = useEditor();
    const theme = useTheme();
    const meta = useValue('paper meta', () => editor.getDocumentSettings().meta, [editor]);
    // One shape looked up by its fixed id: cheap however much ink there is.
    const sheet = useValue('paper sheet', () => {
        const shape = paperSheetOf(editor);
        return shape ? (paperSheetTemplateOf(shape) || true) : null;
    }, [editor]);
    const paper = paperFromMeta(meta, readDevicePaper());
    return {
        paper,
        look: resolvePaper(paper, theme.palette.mode, { sheet: Boolean(sheet) }),
        template: typeof sheet === 'string' ? sheet : null,
        hasSheet: Boolean(sheet),
    };
}

/** Choose paper for this sketch, and make it this device's default. Never touches a template sheet. */
export function setPaper(editor, change) {
    const meta = editor.getDocumentSettings().meta;
    const next = { ...paperFromMeta(meta, readDevicePaper()), ...change };
    editor.updateDocumentSettings({ meta: { ...meta, paperColor: next.color, paperPattern: next.pattern } });
    writeDevicePaper(next);
}

/** Is there anything on the page besides a template sheet? */
export function hasInk(editor) {
    const ids = editor?.getCurrentPageShapeIds?.();
    if (!ids || ids.size === 0) return false;
    if (ids.size > 1) return true;
    return !isPaperSheetShape(editor.getShape?.([...ids][0]));
}

/**
 * Bring the template sheet into view: its whole width, from the top, never
 * past 100%. The camera only — session state, never the saved document.
 * False when the sketch has no sheet.
 */
export function showTemplateSheet(editor) {
    if (!editor || editor.isDisposed) return false;
    const shape = paperSheetOf(editor);
    if (!shape) return false;
    const bounds = editor.getShapePageBounds?.(shape) || { x: shape.x, y: shape.y, w: shape.props?.w, h: shape.props?.h };
    editor.zoomToBounds?.(sheetViewBox(bounds, editor.getViewportScreenBounds?.()), { targetZoom: 1, inset: 16 });
    return true;
}

/**
 * Print a template into this sketch (an id), or take it off (null).
 *
 * The sheet is a locked shape in the drawing, so it saves and syncs with the
 * note like ink, and one Undo takes back the whole change. Choosing another
 * template swaps the sheet where it is. Nothing is written when the choice
 * is the one the sketch already has. Never a device default.
 */
export function setPaperTemplate(editor, id) {
    const existing = paperSheetOf(editor);
    const current = paperSheetTemplateOf(existing);
    const next = id || null;
    if (next === current && Boolean(existing) === Boolean(next)) return;
    editor.mark?.('paper template');
    changing.add(editor);
    try {
        if (!next) {
            removePaperSheet(editor);
            return;
        }
        const at = existing
            ? { x: existing.x, y: existing.y }
            : sheetPlacement({ hasInk: hasInk(editor), viewport: editor.getViewportPageBounds?.() });
        if (!placePaperSheet(editor, next, at)) return;
    } finally {
        changing.delete(editor);
    }
    showTemplateSheet(editor);
}

/** Editors whose sheet this file is changing right now (the guard below lets those through). */
const changing = new WeakSet();

/**
 * Keep the sheet locked. tldraw lets a locked shape be unlocked from its
 * context menu (right-click or long-press selects it and offers Unlock),
 * after which it could be dragged or erased like a pasted picture. The only
 * way to change a sheet is the Paper menu.
 * @returns {Function} unregister
 */
export function guardTemplateSheet(editor) {
    const register = editor.sideEffects?.registerBeforeChangeHandler;
    if (!register) return () => {};
    return register.call(editor.sideEffects, 'shape', (prev, next) => {
        if (changing.has(editor)) return next;
        if (!prev.isLocked || next.isLocked || !isPaperSheetShape(prev)) return next;
        return prev;
    });
}
