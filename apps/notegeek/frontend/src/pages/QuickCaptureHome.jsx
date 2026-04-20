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
  Snackbar,
  Alert,
  useTheme,
} from '@mui/material';
import ArrowForward from '@mui/icons-material/ArrowForward';
import { NOTE_TYPES } from '../components/notes/NoteTypeRouter';
import useNoteStore from '../store/noteStore';
import useAuthStore from '../store/authStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { previewText } from '../utils/previewText';

// ─── Type pills ──────────────────────────────────────────────────────────────
const TYPE_PILLS = [
  { type: NOTE_TYPES.TEXT,        label: 'TEXT' },
  { type: NOTE_TYPES.MARKDOWN,    label: 'MARKDOWN' },
  { type: NOTE_TYPES.CODE,        label: 'CODE' },
  { type: NOTE_TYPES.MINDMAP,     label: 'MINDMAP' },
  { type: NOTE_TYPES.HANDWRITTEN, label: 'SKETCH' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function getTypeColor(type, palette) {
  return palette.noteTypes?.[type] || palette.noteTypes?.text || palette.primary.main;
}

function getPreview(content, type = 'text', maxLen = 100) {
  return previewText(content, type, maxLen);
}

// ─── NoteRow: editorial list row ─────────────────────────────────────────────

function NoteRow({ note, theme, onClick }) {
  const typeColor = getTypeColor(note.type || 'text', theme.palette);
  const preview = getPreview(note.content, note.type || 'text');

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        width: '100%',
        textAlign: 'left',
        py: 1.25,
        px: { xs: 0, sm: 0.5 },
        borderRadius: 0,
        color: 'inherit',
        transition: 'background 120ms ease',
        '&:hover': {
          bgcolor: theme.palette.glow.soft,
          '& .type-dot': { transform: 'scale(1.5)' },
        },
      }}
    >
      {/* Type-color identity dot */}
      <Box
        className="type-dot"
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bgcolor: typeColor,
          flexShrink: 0,
          mt: preview ? '7px' : '6px',
          transition: 'transform 120ms ease',
        }}
      />

      {/* Main content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body1"
          sx={{
            color: 'text.primary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.45,
          }}
        >
          {note.title || 'Untitled'}
        </Typography>
        {preview && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.5,
              mt: 0.25,
            }}
          >
            {preview}
          </Typography>
        )}
      </Box>

      {/* Tag pills — hidden on xs */}
      {note.tags && note.tags.length > 0 && (
        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            gap: 0.5,
            flexShrink: 0,
            alignSelf: 'center',
          }}
        >
          {note.tags.slice(0, 2).map((tag) => (
            <Typography
              key={tag}
              variant="caption"
              sx={{
                px: 0.75,
                py: 0.125,
                borderRadius: '4px',
                border: `1px solid ${theme.palette.border}`,
                bgcolor: theme.palette.glow.soft,
                color: 'text.secondary',
                lineHeight: '18px',
              }}
            >
              {tag.split('/').pop()}
            </Typography>
          ))}
        </Box>
      )}

      {/* Timestamp */}
      <Typography
        variant="caption"
        sx={{
          flexShrink: 0,
          minWidth: 44,
          textAlign: 'right',
          color: 'text.disabled',
          alignSelf: 'center',
        }}
      >
        {formatRelativeTime(note.updatedAt || note.createdAt)}
      </Typography>
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
  const [captureToast, setCaptureToast] = useState(false);

  useEffect(() => {
    fetchNotes({ limit: 50 });
  }, [fetchNotes]);

  const handleQuickCapture = async (e) => {
    e.preventDefault();
    if (!captureText.trim()) return;
    const created = await createNote({
      title: captureText.trim(),
      type: 'text',
      content: '',
    });
    if (created) {
      setCaptureText('');
      setCaptureToast(true);
      navigate(`/notes/${created.id || created._id}/edit`);
    }
  };

  const sortedNotes = [...notes].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt);
    const dateB = new Date(b.updatedAt || b.createdAt);
    return dateB - dateA;
  });

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  // Compact note-count caption (e.g. "12 notes · last edited 4h ago")
  const lastEdited = sortedNotes[0]
    ? formatRelativeTime(sortedNotes[0].updatedAt || sortedNotes[0].createdAt)
    : null;
  const countCaption = notes.length > 0
    ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}${lastEdited ? ` · last edited ${lastEdited}` : ''}`
    : null;

  return (
    <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto', py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 0 } }}>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* GREETING                                                        */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {!isLoadingList && (
        <Box sx={{ mb: { xs: 2.5, sm: 3 } }}>
          <Typography variant="h2" sx={{ color: 'text.primary', mb: 0.5 }}>
            {getGreeting()}{firstName ? `, ${firstName}` : ''}
          </Typography>
          {countCaption && (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {countCaption}
            </Typography>
          )}
        </Box>
      )}

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* TYPEWRITER STRIP — quick capture                                */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <Box
        component="form"
        onSubmit={handleQuickCapture}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          borderRadius: '6px',
          border: `1px solid ${theme.palette.border}`,
          bgcolor: theme.palette.surfaces.elevated,
          px: 1.5,
          py: 0.75,
          transition: 'border-color 120ms ease, box-shadow 120ms ease',
          '&:focus-within': {
            borderColor: theme.palette.primary.main,
            boxShadow: `0 0 0 3px ${theme.palette.glow.ring}`,
          },
        }}
      >
        <TextField
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          placeholder="type a thought…"
          fullWidth
          variant="standard"
          InputProps={{ disableUnderline: true }}
          inputProps={{ 'aria-label': 'Quick capture' }}
          sx={{
            '& .MuiInputBase-root': {
              fontFamily: theme.typography.fontFamilyMono,
              fontSize: '0.9375rem',
              fontWeight: 400,
              color: 'text.primary',
            },
            '& .MuiInputBase-input::placeholder': {
              color: 'text.disabled',
              opacity: 1,
              fontStyle: 'italic',
            },
          }}
        />
        <Button
          type="submit"
          variant="contained"
          size="small"
          disabled={!captureText.trim()}
          sx={{ flexShrink: 0, borderRadius: '6px', px: 2 }}
        >
          Capture
        </Button>
      </Box>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* TYPE PILLS ROW                                                  */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.75,
          mb: { xs: 3, sm: 4 },
        }}
      >
        {TYPE_PILLS.map((pill) => {
          const color = getTypeColor(pill.type, theme.palette);
          return (
            <ButtonBase
              key={pill.type}
              onClick={() => navigate(`/notes/new?type=${encodeURIComponent(pill.type)}`)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.625,
                px: 1,
                py: 0.375,
                borderRadius: '4px',
                border: `1px solid ${theme.palette.border}`,
                bgcolor: 'transparent',
                fontFamily: theme.typography.fontFamilyMono,
                fontSize: '0.6875rem',
                fontWeight: 500,
                letterSpacing: '0.04em',
                color: 'text.secondary',
                transition: 'all 120ms ease',
                '&:hover': {
                  bgcolor: theme.palette.glow.soft,
                  borderColor: color,
                  color,
                },
              }}
            >
              {/* type-color dot */}
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: color,
                  flexShrink: 0,
                }}
              />
              {pill.label}
            </ButtonBase>
          );
        })}
      </Box>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* RECENT NOTES                                                    */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {isLoadingList ? (
        <Box>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton
              key={i}
              height={44}
              sx={{ borderRadius: 1, mb: 0.5 }}
              variant="rounded"
            />
          ))}
        </Box>
      ) : sortedNotes.length === 0 ? (
        <Box sx={{ py: { xs: 4, sm: 6 }, textAlign: 'center' }}>
          <Typography variant="body1" sx={{ color: 'text.disabled', mb: 0.75 }}>
            Nothing here yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled', maxWidth: 340, mx: 'auto' }}>
            The strip above is for quick text notes — type a thought and press Capture.
            For richer formats like Markdown, code, or mind maps, use the type pills below it.
          </Typography>
        </Box>
      ) : (
        <Box>
          {/* Section header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant="h6" sx={{ color: 'text.disabled' }}>
              Recent
            </Typography>
            <Button
              variant="text"
              size="small"
              endIcon={<ArrowForward sx={{ fontSize: '14px !important' }} />}
              onClick={() => navigate('/notes')}
              sx={{
                fontFamily: theme.typography.fontFamilyMono,
                fontSize: '0.6875rem',
                fontWeight: 500,
                letterSpacing: '0.03em',
                color: 'text.secondary',
                minWidth: 0,
                px: 0.75,
                '&:hover': { color: 'primary.main', bgcolor: theme.palette.glow.soft },
              }}
            >
              All notes
            </Button>
          </Box>

          {/* Editorial rows with hairline dividers */}
          <Box>
            {sortedNotes.slice(0, 12).map((note, idx) => (
              <React.Fragment key={note.id || note._id}>
                {idx > 0 && (
                  <Divider sx={{ borderColor: theme.palette.divider }} />
                )}
                <NoteRow
                  note={note}
                  theme={theme}
                  onClick={() => navigate(`/notes/${note.id || note._id}`)}
                />
              </React.Fragment>
            ))}
          </Box>
        </Box>
      )}

      {/* Quick-capture success toast */}
      <Snackbar
        open={captureToast}
        autoHideDuration={1800}
        onClose={() => setCaptureToast(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          onClose={() => setCaptureToast(false)}
          sx={{
            bgcolor: theme.palette.glow.soft,
            color: 'text.primary',
            border: `1px solid ${theme.palette.border}`,
            '& .MuiAlert-icon': { color: 'primary.main' },
          }}
        >
          Note captured
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default QuickCaptureHome;
