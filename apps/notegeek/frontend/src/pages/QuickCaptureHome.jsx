import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  ButtonBase,
  Divider,
  IconButton,
  InputBase,
  Skeleton,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { GeekEmptyState, GeekSheet, slashFocusProps, useToast } from '@geeksuite/ui';
import ArrowForward from '@mui/icons-material/ArrowForward';
import CallMerge from '@mui/icons-material/CallMerge';
import FoldTargetPicker from '../components/foldin/FoldTargetPicker';
import FoldInSheet from '../components/foldin/FoldInSheet';
import NoteRow from '../components/notes/NoteRow';
import useNoteStore from '../store/noteStore';
import { newNotePath, noteTypeMeta } from '../components/notes/noteTypeMeta';
import { graphiteTokens, gridBackground, layout, tapTarget44 } from '../theme/tokens';
import { useNoteSelection, rowSelectProps } from '../hooks/useNoteSelection';
import { SelectButton, SelectingHeader } from '../components/select/SelectControl';
import SelectionBar from '../components/select/SelectionBar';

const RECENT_COUNT = 12;

/** Section heading: a sentence-case label with a hairline running to the edge. */
function SectionHeading({ children, action, id }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', px: '8px', mb: '2px' }}>
      <Typography id={id} component="h2" variant="h6" sx={{ color: 'text.secondary', m: 0, whiteSpace: 'nowrap' }}>
        {children}
      </Typography>
      <Box aria-hidden sx={{ flex: 1, height: '1px', bgcolor: theme.palette.divider }} />
      {action}
    </Box>
  );
}

/** A photo / sketch shortcut inside the capture box. */
function CaptureShortcut({ entryKey, label }) {
  const navigate = useNavigate();
  const Icon = noteTypeMeta(entryKey).Icon;
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={() => navigate(newNotePath(entryKey))}
        sx={{ ...tapTarget44, borderRadius: '10px', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
      >
        <Icon sx={{ fontSize: 22 }} />
      </IconButton>
    </Tooltip>
  );
}

/**
 * Home — the capture box and your notes. Nothing else.
 *
 * Graphite (2026-09-29) dropped the greeting block and the "Continue where
 * you left off" cards: both pushed the notes below the fold of a phone, and
 * the cards were the first three rows of Recent again. The first phone
 * screen is now a place to write and the notes you wrote last.
 *
 * The capture box makes a Markdown note (the app's default type) and stays
 * here; with nothing typed it offers Photo and Sketch instead, so the
 * phone's three front-door kinds of note all start on this screen.
 */
function QuickCaptureHome() {
  const navigate = useNavigate();
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const { notes, fetchNotes, isLoadingList, createNote } = useNoteStore();
  const [captureText, setCaptureText] = useState('');
  // "Fold into…" (DOCS/CONTEXT.md §13): a capture that belongs in a note you
  // already have. Pick the note (suggestions ranked like the share target's),
  // then Fold-in shows where it goes before anything changes.
  const [foldPicking, setFoldPicking] = useState(false);
  const [foldTarget, setFoldTarget] = useState(null);
  const { notify } = useToast();
  // Select mode over the notes on Home (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U1).
  const selection = useNoteSelection();

  useEffect(() => {
    fetchNotes({ limit: 50 });
  }, [fetchNotes]);

  const handleQuickCapture = async (e) => {
    e.preventDefault();
    if (!captureText.trim()) return;
    const created = await createNote({
      title: '',
      type: 'markdown',
      content: captureText.trim(),
    });
    if (created) {
      setCaptureText('');
      notify('Note saved', { tone: 'success' });
      // Stay on home — refresh the list so the new note appears in Recent
      fetchNotes({ limit: 50 });
    }
  };

  const recentNotes = notes.slice(0, RECENT_COUNT);
  // Pinned notes get their own quiet group above Recent — the server already
  // sorts them first, so this is a client-side split of the same slice, not
  // a resort, and they are pulled out so Recent never repeats them.
  const pinnedNotes = recentNotes.filter((n) => n.pinned);
  const otherNotes = recentNotes.filter((n) => !n.pinned);
  const canCapture = captureText.trim().length > 0;

  return (
    <Box sx={{ minHeight: '100%' }}>
      {/* The capture band: a strip of engineering paper with the box on it. */}
      <Box sx={{ ...gridBackground(theme), borderBottom: `1px solid ${g.rule}` }}>
        <Box sx={{ width: '100%', maxWidth: layout.contentWidth, mx: 'auto', px: { xs: '12px', sm: '24px' }, py: { xs: '12px', sm: '24px' } }}>
          <Box
            component="form"
            onSubmit={handleQuickCapture}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minHeight: 56,
              pl: '16px',
              pr: '6px',
              borderRadius: '12px',
              border: `1px solid ${g.border}`,
              bgcolor: g.sheet,
              transition: 'border-color 120ms ease',
              '&:focus-within': { borderColor: g.ink },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            <InputBase
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              placeholder="Write something down…"
              fullWidth
              // `/` lands here, not in the header search: this page exists to
              // catch a thought. No select — a half-typed thought is not a
              // query to replace.
              inputProps={{ 'aria-label': 'Quick capture', ...slashFocusProps(30, { select: false }) }}
              sx={{
                fontSize: '1rem',
                color: 'text.primary',
                minHeight: 44,
                '& .MuiInputBase-input::placeholder': { color: 'text.secondary', opacity: 1 },
              }}
            />
            {canCapture ? (
              <>
                <Tooltip title="Fold into a note…">
                  <IconButton aria-label="Fold into an existing note" onClick={() => setFoldPicking(true)} sx={{ ...tapTarget44, color: 'text.secondary', flexShrink: 0 }}>
                    <CallMerge fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Button type="submit" variant="contained" disableElevation sx={{ flexShrink: 0, borderRadius: '8px', px: '16px', minHeight: 44 }}>
                  Save
                </Button>
              </>
            ) : (
              <>
                <CaptureShortcut entryKey="photo" label="New note from a photo of a page" />
                <CaptureShortcut entryKey="handwritten" label="New sketch" />
              </>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ width: '100%', maxWidth: layout.contentWidth, mx: 'auto', px: { xs: '8px', sm: '16px' }, pt: { xs: '12px', sm: '20px' }, pb: '24px' }}>
        {isLoadingList ? (
          <Box sx={{ px: '8px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={layout.rowHeight} sx={{ borderRadius: 1, mb: 0.5 }} variant="rounded" />
            ))}
          </Box>
        ) : notes.length === 0 ? (
          <GeekEmptyState
            title="Nothing here yet"
            description="Write a thought in the box above and press Save. The camera makes a note from a photo of a page; the pen starts a sketch."
          />
        ) : (
          <>
            {selection.active && <SelectingHeader selection={selection} />}
            {pinnedNotes.length > 0 && (
              <Box component="section" aria-labelledby="home-pinned">
                <SectionHeading id="home-pinned" action={selection.active ? null : <SelectButton selection={selection} />}>Pinned</SectionHeading>
                <Box>
                  {pinnedNotes.map((note, idx) => (
                    <React.Fragment key={note.id || note._id}>
                      {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
                      <NoteRow
                        note={note}
                        onClick={() => navigate(`/notes/${note.id || note._id}`)}
                        {...rowSelectProps(selection, note)}
                      />
                    </React.Fragment>
                  ))}
                </Box>
              </Box>
            )}
            {otherNotes.length > 0 && (
              <Box component="section" aria-labelledby="home-recent">
                <SectionHeading
                  id="home-recent"
                  action={
                    <>
                    {pinnedNotes.length === 0 && !selection.active && <SelectButton selection={selection} />}
                    <ButtonBase
                      onClick={() => navigate('/notes')}
                      sx={{
                        ...tapTarget44,
                        gap: '4px',
                        px: '6px',
                        borderRadius: '8px',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        color: 'text.secondary',
                        '&:hover': { color: 'text.primary' },
                        '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
                      }}
                    >
                      All notes
                      <ArrowForward aria-hidden sx={{ fontSize: 15 }} />
                    </ButtonBase>
                    </>
                  }
                >
                  Recent
                </SectionHeading>
                <Box>
                  {otherNotes.map((note, idx) => (
                    <React.Fragment key={note.id || note._id}>
                      {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
                      <NoteRow
                        note={note}
                        onClick={() => navigate(`/notes/${note.id || note._id}`)}
                        {...rowSelectProps(selection, note)}
                      />
                    </React.Fragment>
                  ))}
                </Box>
              </Box>
            )}
          </>
        )}
        <SelectionBar selection={selection} />
      </Box>
      <GeekSheet
        open={foldPicking}
        onClose={() => setFoldPicking(false)}
        title="Fold into a note"
        description="Pick the note this belongs in."
      >
        {foldPicking ? (
          <FoldTargetPicker
            text={captureText}
            onPick={(n) => { setFoldPicking(false); setFoldTarget(n); }}
          />
        ) : null}
      </GeekSheet>
      {foldTarget ? (
        <FoldInSheet
          open
          note={foldTarget}
          initialInput={captureText.trim()}
          onClose={() => setFoldTarget(null)}
          onApplied={() => { setCaptureText(''); fetchNotes({ limit: 50 }); }}
        />
      ) : null}
    </Box>
  );
}

export default QuickCaptureHome;
