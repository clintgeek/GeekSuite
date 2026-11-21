/** The sketch paper's hook and setter (model in paperModel.js, components in Paper.jsx). */
import { useTheme } from '@mui/material';
import { useEditor, useValue } from '@tldraw/tldraw';
import {
    metaWithTemplate, paperFromMeta, readDevicePaper, resolvePaper, templateFromMeta, templateViewBox, writeDevicePaper,
} from './paperModel';

/** The sketch's paper, resolved for painting, and its page template (an id this build can draw, or null). */
export function usePaper() {
    const editor = useEditor();
    const theme = useTheme();
    const meta = useValue('paper meta', () => editor.getDocumentSettings().meta, [editor]);
    const paper = paperFromMeta(meta, readDevicePaper());
    return { paper, look: resolvePaper(paper, theme.palette.mode), template: templateFromMeta(meta) };
}

/** Choose paper for this sketch, and make it this device's default. */
export function setPaper(editor, change) {
    const meta = editor.getDocumentSettings().meta || {};
    const next = { ...paperFromMeta(meta, readDevicePaper()), ...change };
    editor.updateDocumentSettings({ meta: { ...meta, paperColor: next.color, paperPattern: next.pattern } });
    writeDevicePaper(next);
}

/**
 * Bring the template's sheet into view: its whole width, from the top, never
 * past 100%. The camera only — session state, never the saved document.
 * False when the sketch has no template this build can draw.
 */
export function showTemplateSheet(editor) {
    if (!editor || editor.isDisposed) return false;
    if (!templateFromMeta(editor.getDocumentSettings?.()?.meta)) return false;
    editor.zoomToBounds?.(templateViewBox(editor.getViewportScreenBounds?.()), { targetZoom: 1, inset: 16 });
    return true;
}

/**
 * Choose this sketch's page template (an id, or null for None). The same
 * write as the paper's — document meta, so it saves, undoes and syncs with
 * the note exactly as the paper does — but for this sketch only: a template
 * is never a device default (DOCS/TEMPLATES_SPEC.md P5).
 */
export function setPaperTemplate(editor, id) {
    const next = metaWithTemplate(editor.getDocumentSettings().meta, id);
    if (!next) return;
    editor.updateDocumentSettings({ meta: next });
    showTemplateSheet(editor);
}
