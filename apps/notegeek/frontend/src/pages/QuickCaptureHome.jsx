import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  ButtonBase,
  Typography,
  Skeleton,
  InputBase,
  useTheme,
  alpha,
} from '@mui/material';
import {
  TextFields as TextIcon,
  Description as MarkdownIcon,
  Code as CodeIcon,
  AccountTree as MindMapIcon,
  Draw as HandwrittenIcon,
  ArrowForward as ArrowIcon,
} from '@mui/icons-material';
import { NOTE_TYPES } from '../components/notes/NoteTypeRouter';
import useNoteStore from '../store/noteStore';
import useAuthStore from '../store/authStore';
import { formatRelativeTime } from '../utils/dateUtils';

// ─── Type shortcuts on the scratch surface ───────────────────────────────────
const TYPE_PILLS = [
  { type: NOTE_TYPES.TEXT, label: 'Text', icon: TextIcon },
  { type: NOTE_TYPES.MARKDOWN, label: 'Markdown', icon: MarkdownIcon },
  { type: NOTE_TYPES.CODE, label: 'Code', icon: CodeIcon },
  { type: NOTE_TYPES.MINDMAP, label: 'Mind Map', icon: MindMapIcon },
  { type: NOTE_TYPES.HANDWRITTEN, label: 'Sketch', icon: HandwrittenIcon },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function getTypeColor(type, palette) {
  return palette.noteTypes?.[type] || palette.noteTypes?.text || palette.primary.main;
}

function getPreview(content, maxLen = 120) {
  if (!content) return '';
  if (typeof content === 'string' && content.startsWith('data:image/')) return '';
  const plain = String(content).replace(/<[^>]+>/g, '');
  return plain.split(/\r?\n/).filter(Boolean).slice(0, 3).join(' ').slice(0, maxLen);
}

// ─── NoteCard: a note as an object on the desk ──────────────────────────────

function NoteCard({ note, featured, onClick, theme }) {
  const typeColor = getTypeColor(note.type || 'text', theme.palette);
  const preview = getPreview(note.content, featured ? 200 : 100);

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        textAlign: 'left',
        borderRadius: 2.5,
        border: `1px solid ${ theme.palette.divider }`,
        bgcolor: 'background.paper',
        overflow: 'hidden',
        width: '100%',
        transition: 'all 150ms ease',
        minHeight: featured ? { xs: 110, sm: 130 } : { xs: 88, sm: 100 },
        '&:hover': {
          borderColor: theme.palette.glow.border,
          boxShadow: `0 0 0 3px ${ theme.palette.glow.ring }`,
          transform: 'translateY(-1px)',
          '& .card-bar': { width: 4 },
        },
      }}
    >
      {/* Left accent — type identity */}
      <Box
        className="card-bar"
        sx={{
          width: 3,
          bgcolor: typeColor,
          flexShrink: 0,
          transition: 'width 150ms ease',
        }}
      />

      <Box
        sx={{
          p: featured ? { xs: 2, sm: 2.5 } : { xs: 1.5, sm: 1.75 },
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {/* Title */}
        <Typography
          sx={{
            fontWeight: featured ? 700 : 600,
            fontSize: featured
              ? { xs: '0.9375rem', sm: '1rem' }
              : { xs: '0.8rem', sm: '0.8125rem' },
            color: 'text.primary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: featured ? '-0.01em' : 0,
            mb: preview ? 0.5 : 'auto',
          }}
        >
          {note.title || 'Untitled'}
        </Typography>

        {/* Preview */}
        {preview && (
          <Typography
            sx={{
              fontSize: featured ? '0.8rem' : '0.6875rem',
              color: 'text.secondary',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: featured ? 3 : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              mb: 'auto',
            }}
          >
            {preview}
          </Typography>
        )}

        {/* Meta */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pt: 1 }}>
          <Typography sx={{ fontSize: '0.5625rem', color: 'text.disabled' }}>
            {formatRelativeTime(note.updatedAt || note.createdAt)}
          </Typography>
          {note.type && note.type !== 'text' && (
            <Typography
              sx={{
                fontSize: '0.5rem',
                fontWeight: 600,
                color: typeColor,
                bgcolor: alpha(typeColor, 0.08),
                px: 0.375,
                py: 0.0625,
                borderRadius: 0.375,
              }}
            >
              {note.type}
            </Typography>
          )}
          {note.tags && note.tags.length > 0 && (
            <Typography sx={{ fontSize: '0.5rem', color: 'text.disabled' }}>
              {note.tags[0].split('/').pop()}
            </Typography>
          )}
        </Box>
      </Box>
    </ButtonBase>
  );
}

// ─── QuickCaptureHome: the thinking workbench ────────────────────────────────

function QuickCaptureHome() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuthStore();
  const { notes, fetchNotes, isLoadingList, createNote } = useNoteStore();
  const [captureText, setCaptureText] = useState('');
  const inputRef = useRef(null);

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
      navigate(`/notes/${ created.id || created._id }/edit`);
    }
  };

  const sortedNotes = [...notes].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt);
    const dateB = new Date(b.updatedAt || b.createdAt);
    return dateB - dateA;
  });

  const featuredNote = sortedNotes[0];
  const deskNotes = sortedNotes.slice(1, 9);
  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  return (
    <Box sx={{ width: '100%', maxWidth: 960, mx: 'auto', py: { xs: 1.5, sm: 3 } }}>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* GREETING — calm context, not a dashboard header                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isLoadingList && (
        <Box sx={{ mb: { xs: 2, sm: 2.5 }, px: { xs: 0.5, sm: 0 } }}>
          <Typography
            sx={{
              fontSize: { xs: '1.125rem', sm: '1.3125rem' },
              fontWeight: 700,
              color: 'text.primary',
              letterSpacing: '-0.025em',
              lineHeight: 1.2,
            }}
          >
            {getGreeting()}{firstName ? `, ${ firstName }` : ''}
          </Typography>
          {notes.length > 0 && (
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: 'text.disabled',
                mt: 0.375,
                letterSpacing: '0.005em',
              }}
            >
              {notes.length} {notes.length === 1 ? 'note' : 'notes'} in your notebook
            </Typography>
          )}
        </Box>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* THE SCRATCH SURFACE — center of gravity, impossible to miss       */}
      {/* This is a scratchpad surface, not a search field.                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Box
        sx={{
          mb: { xs: 3, sm: 4 },
          borderRadius: 3,
          border: `1px solid ${ theme.palette.divider }`,
          bgcolor: 'background.paper',
          overflow: 'hidden',
          transition: 'border-color 180ms ease, box-shadow 180ms ease',
          '&:focus-within': {
            borderColor: theme.palette.glow.border,
            boxShadow: `0 0 0 3px ${ theme.palette.glow.ring }`,
          },
        }}
      >
        <Box
          component="form"
          onSubmit={handleQuickCapture}
          sx={{ px: { xs: 2.5, sm: 3.5 }, pt: { xs: 2.5, sm: 3.5 }, pb: { xs: 1.5, sm: 2 } }}
        >
          <InputBase
            ref={inputRef}
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            placeholder="What's on your mind?"
            fullWidth
            sx={{
              fontSize: { xs: '1rem', sm: '1.1875rem' },
              fontWeight: 500,
              color: 'text.primary',
              '& .MuiInputBase-input': {
                py: 0,
                '&::placeholder': {
                  color: alpha(theme.palette.text.primary, 0.22),
                  opacity: 1,
                },
              },
            }}
          />
        </Box>

        {/* Type pills + keyboard hint */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: { xs: 2.5, sm: 3.5 },
            pb: { xs: 2, sm: 2.5 },
            pt: 0.5,
            flexWrap: 'wrap',
          }}
        >
          {TYPE_PILLS.map((pill) => {
            const color = getTypeColor(pill.type, theme.palette);
            return (
              <ButtonBase
                key={pill.type}
                onClick={() => navigate(`/notes/new?type=${ encodeURIComponent(pill.type) }`)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  py: 0.375,
                  borderRadius: 1.25,
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  color: 'text.disabled',
                  bgcolor: alpha(theme.palette.text.primary, 0.03),
                  transition: 'all 120ms ease',
                  '&:hover': {
                    color,
                    bgcolor: alpha(color, 0.08),
                  },
                }}
              >
                <pill.icon sx={{ fontSize: 13 }} />
                {pill.label}
              </ButtonBase>
            );
          })}
          <Typography
            sx={{
              fontSize: '0.5625rem',
              color: alpha(theme.palette.text.primary, 0.15),
              ml: 'auto',
              display: { xs: 'none', sm: 'block' },
            }}
          >
            ↵ to create
          </Typography>
        </Box>
      </Box>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ON YOUR DESK — active artifacts, not a file list                  */}
      {/* Notes as objects in a spatial grid, not rows in a table.          */}
      {/* Featured card = the note you were just working on (largest).      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isLoadingList ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={i === 1 ? 130 : 100}
              sx={{
                borderRadius: 2.5,
                gridColumn: i === 1 ? { sm: 'span 2' } : undefined,
              }}
            />
          ))}
        </Box>
      ) : sortedNotes.length === 0 ? (
        <Box sx={{ py: { xs: 4, sm: 6 }, textAlign: 'center' }}>
          <Typography
            sx={{ fontSize: '0.9375rem', color: 'text.disabled', fontWeight: 500, mb: 0.5 }}
          >
            Your desk is empty
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>
            Start typing above to capture your first thought
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
              mb: 1.5,
              px: { xs: 0.5, sm: 0 },
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'text.disabled',
              }}
            >
              On your desk
            </Typography>
            <ButtonBase
              onClick={() => navigate('/notes')}
              sx={{
                fontSize: '0.5625rem',
                fontWeight: 600,
                color: 'text.disabled',
                transition: 'color 80ms ease',
                '&:hover': { color: 'primary.main' },
              }}
            >
              All notes <ArrowIcon sx={{ fontSize: 10, ml: 0.25 }} />
            </ButtonBase>
          </Box>

          {/* Spatial card grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              gap: { xs: 1.5, sm: 2 },
            }}
          >
            {/* Featured: the note you were just in — spans 2 cols on sm+ */}
            {featuredNote && (
              <Box sx={{ gridColumn: { sm: 'span 2' } }}>
                <NoteCard
                  note={featuredNote}
                  featured
                  onClick={() => navigate(`/notes/${ featuredNote.id || featuredNote._id }`)}
                  theme={theme}
                />
              </Box>
            )}

            {/* Rest of desk */}
            {deskNotes.map((note) => (
              <NoteCard
                key={note.id || note._id}
                note={note}
                onClick={() => navigate(`/notes/${ note.id || note._id }`)}
                theme={theme}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default QuickCaptureHome;
