/** The sketch paper's hook and setter (model in paperModel.js, components in Paper.jsx). */
import { useTheme } from '@mui/material';
import { useEditor, useValue } from '@tldraw/tldraw';
import { paperFromMeta, readDevicePaper, resolvePaper, writeDevicePaper } from './paperModel';

/** The sketch's paper, resolved for painting. */
export function usePaper() {
    const editor = useEditor();
    const theme = useTheme();
    const meta = useValue('paper meta', () => editor.getDocumentSettings().meta, [editor]);
    const paper = paperFromMeta(meta, readDevicePaper());
    return { paper, look: resolvePaper(paper, theme.palette.mode) };
}

/** Choose paper for this sketch, and make it this device's default. */
export function setPaper(editor, change) {
    const meta = editor.getDocumentSettings().meta || {};
    const next = { ...paperFromMeta(meta, readDevicePaper()), ...change };
    editor.updateDocumentSettings({ meta: { ...meta, paperColor: next.color, paperPattern: next.pattern } });
    writeDevicePaper(next);
}
