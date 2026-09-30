import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Typography, useTheme } from '@mui/material';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import { IMPORT_ACCEPT } from '../../utils/importMarkdown';
import useNoteImport from '../../hooks/useNoteImport';
import useImportStore from '../../store/importStore';
import { graphiteTokens } from '../../theme/tokens';

/**
 * NoteImporter — Markdown files in, new notes out (DOCS/CONTEXT.md §9).
 *
 * Mounted once by Layout, inside the toast provider. Two ways in:
 *
 *   - **Drop** (desktop): drag one or more `.md` / `.markdown` / `.txt`
 *     files onto home, the notes list, a tag's list or search — or onto a
 *     brand-new, still-empty note — and each becomes a new Markdown note.
 *     While files are over the window a drop zone covers the page.
 *   - **Pick** (the phone, and desktop's New menu): "Import a Markdown
 *     file" calls `openImportPicker()` (store/importStore.js), which clicks
 *     this component's hidden `<input type="file" multiple>`.
 *
 * One file opens its new note; several stay put and say how many landed.
 * Anything that is not Markdown or text is skipped with a toast, and a file
 * too big for a note is refused before it is sent (hooks/useNoteImport.js,
 * utils/importMarkdown.js).
 */

const DROP_ROUTES = [/^\/$/, /^\/notes\/?$/, /^\/tags\//, /^\/search\/?$/];

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

function DropZone() {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  return (
    <Box
      data-import-dropzone
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: theme.zIndex.modal + 10,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: '24px',
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(21, 24, 26, 0.86)' : 'rgba(233, 238, 231, 0.88)',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 520,
          minHeight: 220,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          p: '32px',
          borderRadius: '8px',
          border: `2px dashed ${g.ink}`,
          bgcolor: g.sheet,
          color: g.ink,
          textAlign: 'center',
        }}
      >
        <Box sx={{ display: 'inline-flex', p: '12px', borderRadius: '50%', bgcolor: g.hl, color: g.onHl }}>
          <UploadFileOutlined sx={{ fontSize: 32 }} />
        </Box>
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 650, color: 'inherit' }}>
          Drop to make notes
        </Typography>
        <Typography sx={{ fontFamily: theme.typography.fontFamilyMono, fontSize: '0.8125rem', color: g.ink2 }}>
          .md, .markdown or .txt · one note per file
        </Typography>
      </Box>
    </Box>
  );
}

function NoteImporter() {
  const { pathname } = useLocation();
  const editorDropOk = useImportStore((s) => s.editorDropOk);
  const setPicker = useImportStore((s) => s.setPicker);
  const inputRef = useRef(null);
  const { importFiles } = useNoteImport();
  const [dragging, setDragging] = useState(false);

  const dropEnabled = DROP_ROUTES.some((re) => re.test(pathname))
    || (pathname === '/notes/new' && editorDropOk);

  useEffect(() => {
    setPicker(() => inputRef.current?.click());
    return () => setPicker(null);
  }, [setPicker]);

  const importRef = useRef(importFiles);
  importRef.current = importFiles;

  useEffect(() => {
    if (!dropEnabled) {
      setDragging(false);
      return undefined;
    }
    // dragenter/dragleave fire for every child crossed, so count them.
    let depth = 0;
    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (e) => {
      if (!hasFiles(e)) return;
      // Without this the drop is the browser's: it opens the file in place
      // of the app.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      importRef.current(e.dataTransfer.files);
    };
    const onEnd = () => { depth = 0; setDragging(false); };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', onEnd);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', onEnd);
    };
  }, [dropEnabled]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        multiple
        hidden
        aria-hidden
        tabIndex={-1}
        data-import-input
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          // Cleared so picking the same file again still fires `change`.
          e.target.value = '';
          importFiles(files);
        }}
      />
      {dragging ? <DropZone /> : null}
    </>
  );
}

export default NoteImporter;
