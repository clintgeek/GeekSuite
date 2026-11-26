import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useQuery } from '@apollo/client';
import { GET_NOTE_BY_ID, SKETCH_TRANSCRIPT } from '../../graphql/queries';
import { useNoteLinks, markdownPluginsFor } from '../../hooks/useNoteLinks';
import { MARKDOWN_COMPONENTS, markdownOverflowSx } from '../notes/markdownComponents';
import TypeIcon from '../notes/TypeIcon';
import { border, glow, surfaces, tapTarget44 } from '../../theme/tokens';
import {
  SPLIT_BAR_HEIGHT, SPLIT_DEFAULT, SPLIT_MAX, fractionAt, settleFraction, stepFraction,
} from './referenceSplit';

// tldraw arrives with the first handwritten reference, not with the page.
const SketchReference = lazy(() => import('./SketchReference'));

const Centered = ({ children }) => (
  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center' }}>
    {children}
  </Box>
);

/** A typed note, or a sketch's transcript: text to scroll, nothing to edit. */
function TextBody({ note, transcript = null }) {
  const resolveLink = useNoteLinks(note.id);
  const plugins = useMemo(() => markdownPluginsFor(resolveLink), [resolveLink]);
  return (
    <Box
      data-testid="reference-text"
      tabIndex={0}
      role="region"
      aria-label={`${note.title || 'Untitled'}, read only`}
      sx={{
        position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden',
        px: { xs: '16px', sm: '32px' }, py: '16px', fontSize: '0.9375rem', lineHeight: 1.6,
        '& > :first-of-type': { mt: 0 },
        '& pre': { whiteSpace: 'pre-wrap', m: 0, fontSize: '0.875rem' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        ...markdownOverflowSx,
      }}
    >
      <Box sx={{ maxWidth: 680, mx: 'auto' }}>
        {transcript !== null ? (
          <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', m: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>
            {transcript}
          </Typography>
        ) : (
          <ReactMarkdown remarkPlugins={plugins} components={MARKDOWN_COMPONENTS}>{note.content || ''}</ReactMarkdown>
        )}
      </Box>
    </Box>
  );
}

/**
 * ReferencePane — a second note, read-only, above the one being written
 * (DOCS/REFERENCE_PANE_SPEC.md).
 *
 * Renders the pane and then `children` (the note page) as siblings, with no
 * wrapper: closed, the page's DOM is what it was before this existed, and
 * opening or closing never remounts the note under the pen.
 *
 * Everything here only reads. The note is fetched with the ordinary note
 * query, its transcript with the ordinary transcript query; nothing is
 * saved, no handwriting read is started, and the server is not told the
 * note was looked at.
 *
 * The bar under the pane is the divider: drag it to a third or half; let go
 * near the top and the pane closes.
 */
export default function ReferencePane({ noteId = null, onClose, onChange, onOpenFull, children }) {
  const theme = useTheme();
  const paneRef = useRef(null);
  const [fraction, setFraction] = useState(SPLIT_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const dragRef = useRef(null);

  // A new note opens on its handwriting (decision 8) at the default size.
  // Closed, the size is forgotten: the next one opens at a third again.
  useEffect(() => {
    setShowTranscript(false);
    if (!noteId) setFraction(SPLIT_DEFAULT);
  }, [noteId]);

  const { data, loading, error } = useQuery(GET_NOTE_BY_ID, {
    variables: { id: noteId },
    skip: !noteId,
    fetchPolicy: 'cache-and-network',
  });
  const note = noteId ? data?.note : null;
  const isSketch = note?.type === 'handwritten';
  const { data: transcriptData } = useQuery(SKETCH_TRANSCRIPT, {
    variables: { noteId },
    skip: !noteId || !isSketch,
    fetchPolicy: 'cache-first',
  });
  const transcript = isSketch ? (transcriptData?.sketchTranscript?.text || '').trim() : '';

  const settle = useCallback((value) => {
    const rest = settleFraction(value);
    if (rest === null) onClose?.();
    else setFraction(rest);
  }, [onClose]);

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button > 0) return;
    const pane = paneRef.current;
    const page = pane?.parentElement;
    if (!pane || !page) return;
    const paneBox = pane.getBoundingClientRect();
    // The pane's bottom edge follows the pointer from wherever the bar was held.
    dragRef.current = { id: e.pointerId, grip: paneBox.bottom - e.clientY, latest: fraction };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    const page = paneRef.current?.parentElement;
    if (!drag || drag.id !== e.pointerId || !page) return;
    const box = page.getBoundingClientRect();
    drag.latest = fractionAt(e.clientY + drag.grip, box.top, box.height);
    setFraction(drag.latest);
  };
  const endDrag = (e) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    settle(drag.latest);
  };
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const next = stepFraction(fraction, e.key === 'ArrowDown' ? 1 : -1);
    if (next === null) onClose?.();
    else setFraction(next);
  };

  if (!noteId) return <>{null}{children}</>;

  const title = note?.title || (note ? 'Untitled' : '');
  const barButtonSx = {
    flexShrink: 0, minHeight: SPLIT_BAR_HEIGHT, px: '10px', textTransform: 'none', fontSize: '0.8125rem', fontWeight: 500,
    color: 'text.secondary', whiteSpace: 'nowrap',
    '&:hover': { color: 'text.primary', bgcolor: glow(theme).soft },
  };
  const iconButtonSx = { ...tapTarget44, flexShrink: 0, borderRadius: '6px', color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: glow(theme).soft } };

  return (
    <>
      <Box
        ref={paneRef}
        component="aside"
        aria-label="Reference note"
        data-testid="reference-pane"
        data-reference-note={noteId}
        sx={{
          flex: '0 0 auto',
          height: `${Math.min(SPLIT_MAX, Math.max(0, fraction)) * 100}%`,
          minHeight: SPLIT_BAR_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: surfaces(theme).elevated,
          // The canvases resize every frame of a drag; nothing else should animate.
          transition: dragging ? 'none' : 'height 120ms ease-out',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          '@media print': { display: 'none' },
        }}
      >
        <Box data-testid="reference-body" sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          {!note ? (
            <Centered>
              {loading ? <CircularProgress size={28} /> : (
                <Typography variant="body2" color="text.secondary">
                  {error ? 'This note could not be loaded.' : 'This note is no longer there.'}
                </Typography>
              )}
            </Centered>
          ) : isSketch && !showTranscript ? (
            note.content ? (
              <Suspense fallback={<Centered><CircularProgress size={28} /></Centered>}>
                <SketchReference content={note.content} />
              </Suspense>
            ) : <Centered><Typography variant="body2" color="text.secondary">Nothing is written on this page.</Typography></Centered>
          ) : isSketch ? (
            <TextBody note={note} transcript={transcript} />
          ) : (
            <TextBody note={note} />
          )}
        </Box>

        <Box
          data-testid="reference-bar"
          sx={{
            flexShrink: 0,
            // 44px of handle inside the rules above and below it.
            height: SPLIT_BAR_HEIGHT,
            boxSizing: 'content-box',
            display: 'flex',
            alignItems: 'center',
            borderTop: `1px solid ${border(theme)}`,
            borderBottom: `2px solid ${border(theme)}`,
            bgcolor: surfaces(theme).paper,
            pr: '4px',
          }}
        >
          <Box
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the reference note. Drag to the top to close it."
            aria-valuemin={0}
            aria-valuemax={Math.round(SPLIT_MAX * 100)}
            aria-valuenow={Math.round(fraction * 100)}
            tabIndex={0}
            data-testid="reference-divider"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            sx={{
              flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: '8px', pl: '12px', pr: '8px',
              cursor: 'row-resize', touchAction: 'none', userSelect: 'none',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
            }}
          >
            <DragHandleIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0 }} />
            {note ? <TypeIcon type={note.type} size={15} /> : null}
            <Typography component="span" data-testid="reference-title" sx={{ minWidth: 0, fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </Typography>
          </Box>
          {transcript ? (
            <Button
              size="small"
              data-testid="reference-transcript"
              aria-pressed={showTranscript}
              onClick={() => setShowTranscript((on) => !on)}
              sx={barButtonSx}
            >
              {showTranscript ? 'Handwriting' : 'Transcript'}
            </Button>
          ) : null}
          {note && onOpenFull ? (
            <Button size="small" data-testid="reference-open" onClick={() => onOpenFull(noteId)} startIcon={<OpenInFullIcon sx={{ fontSize: '16px !important' }} />} sx={barButtonSx}>
              Open this note
            </Button>
          ) : null}
          {onChange ? (
            <Tooltip title="Show a different note">
              <IconButton aria-label="Show a different note" data-testid="reference-change" onClick={onChange} size="small" sx={iconButtonSx}>
                <SwapHorizIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          <Tooltip title="Close">
            <IconButton aria-label="Close the reference note" data-testid="reference-close" onClick={onClose} size="small" sx={iconButtonSx}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      {children}
    </>
  );
}
