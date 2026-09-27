import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  ButtonBase,
  Typography,
  Skeleton,
  TextField,
  Button,
  Divider,
  useTheme,
} from '@mui/material';
import { GeekEmptyState, slashFocusProps, useToast } from '@geeksuite/ui';
import ArrowForward from '@mui/icons-material/ArrowForward';
import NoteRow from '../components/notes/NoteRow';
import useNoteStore from '../store/noteStore';
import useAuthStore from '../store/authStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { greetingNameFrom } from '../utils/userDisplay';
import { previewText } from '../utils/previewText';
import TypeStamp from '../components/notes/TypeStamp';
import { NOTE_TYPE_META, NOTE_TYPE_ORDER } from '../components/notes/noteTypeMeta';
import { CodePreview, NoteThumb } from '../components/notes/NotePreview';
import { border, glow, stampInk, surfaces, layout, dotGridBackground } from '../theme/tokens';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Section heading: typewritten, with a hairline running to the edge. */
function SectionHeading({ children, action }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '8px' }}>
      <Typography component="h2" variant="h6" sx={{ color: 'text.secondary', m: 0, whiteSpace: 'nowrap' }}>
        {children}
      </Typography>
      <Box aria-hidden sx={{ flex: 1, height: '1px', bgcolor: theme.palette.divider }} />
      {action}
    </Box>
  );
}

/**
 * "Continue where you left off" — the last few notes, as pages you can pick
 * back up. There is no pin in the data model (the gateway's `Note` type has
 * no such field), so recency is the honest signal here.
 */
function ContinueCard({ note, onOpen }) {
  const theme = useTheme();
  const type = note.type || 'text';
  const isVisual = type === 'handwritten' || type === 'mindmap';
  const preview = type === 'code' || isVisual ? '' : previewText(note.content, type, 220, { shape: true });

  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        textAlign: 'left',
        width: '100%',
        minWidth: 0,
        minHeight: { xs: 0, md: 168 },
        p: { xs: '12px', md: '16px' },
        gap: '8px',
        borderRadius: '4px',
        border: `1px solid ${border(theme)}`,
        bgcolor: surfaces(theme).elevated,
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        '&:hover': {
          borderColor: theme.palette.text.secondary,
          boxShadow: theme.palette.mode === 'dark' ? '0 1px 3px rgba(0,0,0,.4)' : '0 1px 3px rgba(31,28,22,.08)',
        },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <TypeStamp type={type} />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" component="span" sx={{ color: 'text.secondary' }}>
          {formatRelativeTime(note.updatedAt || note.createdAt)}
        </Typography>
      </Box>
      <Typography
        component="div"
        sx={{
          fontWeight: 700,
          fontSize: '1.0625rem',
          letterSpacing: '-0.015em',
          lineHeight: 1.3,
          color: 'text.primary',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {note.title || 'Untitled'}
      </Typography>
      {type === 'code' ? (
        <CodePreview content={note.content} lines={3} />
      ) : isVisual ? (
        <NoteThumb note={note} />
      ) : preview ? (
        <Typography
          component="div"
          sx={{
            color: 'text.secondary',
            fontSize: '0.8125rem',
            lineHeight: 1.55,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: { xs: 2, md: 3 },
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
          }}
        >
          {preview}
        </Typography>
      ) : null}
    </ButtonBase>
  );
}

// ─── QuickCaptureHome ────────────────────────────────────────────────────────

function QuickCaptureHome() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuthStore();
  const { notes, fetchNotes, isLoadingList, createNote } = useNoteStore();
  const [captureText, setCaptureText] = useState('');
  const { notify } = useToast();

  useEffect(() => {
    fetchNotes({ limit: 50 });
  }, [fetchNotes]);

  const handleQuickCapture = async (e) => {
    e.preventDefault();
    if (!captureText.trim()) return;
    const created = await createNote({
      title: '',
      type: 'text',
      content: captureText.trim(),
    });
    if (created) {
      setCaptureText('');
      notify('Note captured', { tone: 'success' });
      // Stay on home — refresh the list so the new note appears in Recent
      fetchNotes({ limit: 50 });
    }
  };

  // Notes come pre-sorted by updatedAt desc from the resolver.
  // "Good evening, Chef", never "chef": whatever name we have, its first
  // letter is capitalised (utils/userDisplay.js).
  const firstName = greetingNameFrom(user);
  const continueNotes = notes.slice(0, 3);
  const recentNotes = notes.slice(3, 15);
  const canCapture = captureText.trim().length > 0;

  // Compact note-count caption (e.g. "12 notes · last edited 4h ago")
  const lastEdited = notes[0]
    ? formatRelativeTime(notes[0].updatedAt || notes[0].createdAt)
    : null;
  const countCaption = notes.length > 0
    ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}${lastEdited ? ` · last edited ${lastEdited}` : ''}`
    : null;

  return (
    <Box sx={{ minHeight: '100%', [theme.breakpoints.up('md')]: dotGridBackground(theme) }}>
    <Box sx={{ width: '100%', maxWidth: 880, mx: 'auto', py: { xs: '16px', sm: '32px' }, px: { xs: '16px', sm: '24px' } }}>

      {/* ── Greeting ─────────────────────────────────────────────────── */}
      {!isLoadingList && (
        <Box sx={{ mb: { xs: '16px', sm: '24px' } }}>
          <Typography variant="h1" component="h1" sx={{ color: 'text.primary', mb: '4px', fontSize: { xs: '1.75rem', sm: '2.25rem' } }}>
            {getGreeting()}{firstName ? `, ${firstName}` : ''}
          </Typography>
          {countCaption && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', m: 0 }}>
              {countCaption}
            </Typography>
          )}
        </Box>
      )}

      {/* ── Quick capture ────────────────────────────────────────────── */}
      <Box
        component="form"
        onSubmit={handleQuickCapture}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          mb: '12px',
          borderRadius: '4px',
          border: `1px solid ${border(theme)}`,
          bgcolor: surfaces(theme).elevated,
          pl: '16px',
          pr: '6px',
          py: '6px',
          transition: 'border-color 120ms ease, box-shadow 120ms ease',
          '&:focus-within': {
            borderColor: theme.palette.primary.main,
            boxShadow: `0 0 0 3px ${glow(theme).ring}`,
          },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <TextField
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          placeholder="type a thought…"
          fullWidth
          variant="standard"
          InputProps={{ disableUnderline: true }}
          // `/` lands here, not in the header search: this page exists to catch a
          // thought. No select — a half-typed thought is not a query to replace.
          inputProps={{ 'aria-label': 'Quick capture', ...slashFocusProps(30, { select: false }) }}
          sx={{
            '& .MuiInputBase-root': {
              fontFamily: theme.typography.fontFamilyMono,
              fontSize: '0.9375rem',
              fontWeight: 400,
              color: 'text.primary',
            },
            '& .MuiInputBase-input::placeholder': {
              color: 'text.secondary',
              opacity: 1,
              fontStyle: 'italic',
            },
          }}
        />
        {/* Enabled and disabled must never be mistaken for each other.
            Ready: solid brick, the one filled control on the page. Empty: an
            outline in dashed pencil with a muted label — clearly waiting,
            not greyed brick that looks broken. Still `disabled` either way
            when there is nothing to capture. */}
        <Button
          type="submit"
          variant={canCapture ? 'contained' : 'outlined'}
          disabled={!canCapture}
          disableElevation
          sx={{
            flexShrink: 0,
            borderRadius: '3px',
            px: '16px',
            minHeight: 36,
            fontFamily: theme.typography.fontFamilyMono,
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            [theme.breakpoints.down('md')]: { minHeight: 44 },
            '&.Mui-disabled': {
              color: stampInk(theme).muted,
              borderStyle: 'dashed',
              borderColor: border(theme),
              bgcolor: 'transparent',
            },
          }}
        >
          Capture
        </Button>
      </Box>

      {/* ── New, by type ─────────────────────────────────────────────── */}
      <Box
        role="group"
        aria-label="New note by type"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: { xs: '0 4px', md: '8px' },
          mb: { xs: '24px', sm: '40px' },
        }}
      >
        <Typography variant="caption" component="span" sx={{ color: 'text.secondary', mr: '4px' }}>
          New
        </Typography>
        {NOTE_TYPE_ORDER.map((type) => (
          <TypeStamp
            key={type}
            type={type}
            size="md"
            aria-label={`New ${NOTE_TYPE_META[type].long.toLowerCase()} note`}
            onClick={() => navigate(`/notes/new?type=${encodeURIComponent(type)}`)}
          />
        ))}
      </Box>

      {/* ── Notes ────────────────────────────────────────────────────── */}
      {isLoadingList ? (
        <Box>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton
              key={i}
              height={layout.rowHeight}
              sx={{ borderRadius: 1, mb: 0.5 }}
              variant="rounded"
            />
          ))}
        </Box>
      ) : notes.length === 0 ? (
        <GeekEmptyState
          title="Nothing here yet"
          description="The strip above is for quick text notes — type a thought and press Capture.
            For richer formats like Markdown, code, or mind maps, use the type stamps below it."
        />
      ) : (
        <>
          <Box component="section" aria-label="Continue where you left off" sx={{ mb: { xs: '24px', sm: '40px' } }}>
            <SectionHeading>Continue where you left off</SectionHeading>
            <Box
              sx={{
                display: 'grid',
                gap: '12px',
                // minmax(0, …), not a bare 1fr: a bare track grows to its
                // content's min width, and a long preview pushed the card
                // off the right edge of a phone.
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: `repeat(${Math.max(continueNotes.length, 1)}, minmax(0, 1fr))` },
                mt: '12px',
              }}
            >
              {continueNotes.map((note) => (
                <ContinueCard
                  key={note.id || note._id}
                  note={note}
                  onOpen={() => navigate(`/notes/${note.id || note._id}`)}
                />
              ))}
            </Box>
          </Box>

          {recentNotes.length > 0 && (
            <Box component="section" aria-label="Recent">
              <SectionHeading
                action={
                  <Button
                    variant="text"
                    size="small"
                    endIcon={<ArrowForward sx={{ fontSize: '14px !important' }} />}
                    onClick={() => navigate('/notes')}
                    sx={{
                      fontFamily: theme.typography.fontFamilyMono,
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      letterSpacing: '0.03em',
                      color: 'text.secondary',
                      minWidth: 0,
                      px: '6px',
                      '&:hover': { color: 'primary.main', bgcolor: glow(theme).soft },
                    }}
                  >
                    All notes
                  </Button>
                }
              >
                Recent
              </SectionHeading>
              <Box>
                {recentNotes.map((note, idx) => (
                  <React.Fragment key={note.id || note._id}>
                    {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
                    <NoteRow
                      note={note}
                      onClick={() => navigate(`/notes/${note.id || note._id}`)}
                    />
                  </React.Fragment>
                ))}
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
    </Box>
  );
}

export default QuickCaptureHome;
