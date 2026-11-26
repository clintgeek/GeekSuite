import React, { useEffect, useRef, useState } from 'react';
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
import { GeekEmptyState, GeekErrorState, GeekSheet, slashFocusProps, useToast } from '@geeksuite/ui';
import ArrowForward from '@mui/icons-material/ArrowForward';
import CallMerge from '@mui/icons-material/CallMerge';
import FoldTargetPicker from '../components/foldin/FoldTargetPicker';
import FoldInSheet from '../components/foldin/FoldInSheet';
import NoteRow from '../components/notes/NoteRow';
import useNoteStore from '../store/noteStore';
import { MEETING_ENTRY, ONE_ON_ONE_ENTRY, newNotePath, noteTypeMeta } from '../components/notes/noteTypeMeta';
import { graphiteTokens, gridBackground, layout, tapTarget44 } from '../theme/tokens';
import { useListWidth } from '../components/notes/ListColumn';
import { usePhoneLayout } from '../hooks/useNoteFormFactor';
import { openOneOnOnePicker } from '../store/oneOnOneStore';

// A handful to pick up from; reading is what Notes and Everything are for.
const RECENT_COUNT = 6;

/** The pen's ways to start, as big targets: the note is one tap from opening the app. */
const STARTS = [
  { key: 'handwritten', label: 'Write' },
  { key: ONE_ON_ONE_ENTRY.key, label: '1:1' },
  { key: MEETING_ENTRY.key, label: 'Meeting' },
  { key: 'photo', label: 'Photo' },
];

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

/** One way to start a note: a big tile. The first is the primary one, on the highlighter. */
function StartTile({ entryKey, label, primary = false }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const meta = noteTypeMeta(entryKey);
  const Icon = meta.Icon;
  const start = () => (entryKey === ONE_ON_ONE_ENTRY.key ? openOneOnOnePicker() : navigate(newNotePath(entryKey)));
  return (
    <ButtonBase
      onClick={start}
      data-home-start={entryKey}
      aria-label={label === meta.long ? label : `${label}: ${meta.long}`}
      aria-haspopup={entryKey === ONE_ON_ONE_ENTRY.key ? 'dialog' : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        minHeight: 84,
        borderRadius: '12px',
        border: `1px solid ${primary ? g.ink : g.border}`,
        bgcolor: primary ? g.hl : g.sheet,
        color: primary ? g.onHl : 'text.primary',
        fontSize: '0.9375rem',
        fontWeight: 650,
        '&:hover': { borderColor: g.ink },
        '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 26 }} />
      {label}
    </ButtonBase>
  );
}

/**
 * Home — capture. (Chef, 2026-11-25: "home should be easy access to
 * capture. I open the app to record notes more often than to read them. Or
 * at least I'm in a bigger hurry when recording than reading.")
 *
 * Two ways in, both on the first screen at every size:
 *   - the start tiles: Write (a handwritten note), 1:1, Meeting, Photo;
 *   - the typing box, which makes a typed note and stays here.
 * The pen leads on a tablet and a desktop; on a phone the typing box does.
 *
 * Under them, the last few notes to pick up from. Browsing is Notes and
 * Everything (DOCS/NOTE_KINDS_SPEC.md), so there is no select mode and no
 * pinned group here any more.
 */
function QuickCaptureHome() {
  const navigate = useNavigate();
  const listWidth = useListWidth();
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const { notes, fetchNotes, isLoadingList, listError, createNote } = useNoteStore();
  const [captureText, setCaptureText] = useState('');
  // One capture at a time (1.21): a double tap on Save made two notes.
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);
  // "Fold into…" (DOCS/CONTEXT.md §13): a capture that belongs in a note you
  // already have. Pick the note (suggestions ranked like the share target's),
  // then Fold-in shows where it goes before anything changes.
  const [foldPicking, setFoldPicking] = useState(false);
  const [foldTarget, setFoldTarget] = useState(null);
  const { notify } = useToast();
  const phone = usePhoneLayout();

  // Only what Home shows (3.5): it used to fetch 50 notes to draw 12.
  useEffect(() => {
    fetchNotes({ limit: RECENT_COUNT });
  }, [fetchNotes]);

  const handleQuickCapture = async (e) => {
    e?.preventDefault?.();
    if (!captureText.trim() || capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      // Line breaks kept (1.21): the box is multi-line now, and only the
      // ends are trimmed — a list typed on a phone stays a list.
      const created = await createNote({
        title: '',
        type: 'markdown',
        content: captureText.replace(/^\s*\n|\s+$/g, ''),
      });
      if (created) {
        setCaptureText('');
        notify('Note saved', { tone: 'success' });
        // Stay on home — refresh the list so the new note appears in Recent
        fetchNotes({ limit: RECENT_COUNT });
      } else {
        // It used to fail without a word, with the text still in the box
        // looking saved. Say so; the text stays for another try.
        const why = useNoteStore.getState().selectedError;
        notify(`Not saved${why ? ` — ${why}` : ''}. Your text is still in the box.`, { tone: 'error' });
      }
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  };

  const recentNotes = notes.slice(0, RECENT_COUNT);
  const canCapture = captureText.trim().length > 0;

  return (
    <Box sx={{ minHeight: '100%' }}>
      {/* The capture band: a strip of engineering paper with the box on it. */}
      <Box sx={{ ...gridBackground(theme), borderBottom: `1px solid ${g.rule}` }}>
        <Box sx={{ width: '100%', maxWidth: listWidth, mx: 'auto', px: { xs: '12px', sm: '24px' }, py: { xs: '12px', sm: '24px' }, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Box
            role="group"
            aria-label="Start a note"
            data-testid="home-starts"
            sx={{
              // The pen leads where there is one; a phone is typed on.
              order: phone ? 2 : 0,
              display: 'grid',
              gap: '8px',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
            }}
          >
            {STARTS.map((start, i) => (
              <StartTile key={start.key} entryKey={start.key} label={start.label} primary={i === 0 && !phone} />
            ))}
          </Box>
          <Box
            component="form"
            onSubmit={handleQuickCapture}
            sx={{
              display: 'flex',
              // Bottom-aligned: the box grows with a multi-line capture and
              // the buttons stay by the thumb.
              alignItems: 'flex-end',
              gap: '4px',
              minHeight: 56,
              py: '6px',
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
              placeholder="Type something down…"
              fullWidth
              multiline
              maxRows={8}
              // Enter is a new line (a capture is often a list); Ctrl/Cmd+Enter saves.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleQuickCapture(e);
              }}
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
                <Button type="submit" variant="contained" disableElevation disabled={capturing} sx={{ flexShrink: 0, borderRadius: '8px', px: '16px', minHeight: 44 }}>
                  {capturing ? 'Saving…' : 'Save'}
                </Button>
              </>
            ) : null}
          </Box>
        </Box>
      </Box>

      <Box sx={{ width: '100%', maxWidth: listWidth, mx: 'auto', px: { xs: '8px', sm: '16px' }, pt: { xs: '12px', sm: '20px' }, pb: '24px' }}>
        {/* Skeletons only when there is nothing to show yet (3.5): the
            notes from the last visit stay on screen while they refresh. */}
        {isLoadingList && notes.length === 0 ? (
          <Box sx={{ px: '8px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={layout.rowHeight} sx={{ borderRadius: 1, mb: 0.5 }} variant="rounded" />
            ))}
          </Box>
        ) : listError && notes.length === 0 ? (
          // A failed load is not "Nothing here yet" (3.5).
          <GeekErrorState
            error={{ message: listError }}
            description="Could not load your notes."
            onRetry={() => fetchNotes({ limit: RECENT_COUNT })}
          />
        ) : notes.length === 0 ? (
          <GeekEmptyState
            title="Nothing here yet"
            description="Write starts a handwritten note. Or type a thought in the box and press Save."
          />
        ) : (
          <Box component="section" aria-labelledby="home-recent">
            <SectionHeading
              id="home-recent"
              action={
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
                  Notes
                  <ArrowForward aria-hidden sx={{ fontSize: 15 }} />
                </ButtonBase>
              }
            >
              Pick up where you left off
            </SectionHeading>
            <Box>
              {recentNotes.map((note, idx) => (
                <React.Fragment key={note.id || note._id}>
                  {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
                  <NoteRow note={note} onClick={() => navigate(`/notes/${note.id || note._id}`)} />
                </React.Fragment>
              ))}
            </Box>
          </Box>
        )}
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
          onApplied={() => { setCaptureText(''); fetchNotes({ limit: RECENT_COUNT }); }}
        />
      ) : null}
    </Box>
  );
}

export default QuickCaptureHome;
