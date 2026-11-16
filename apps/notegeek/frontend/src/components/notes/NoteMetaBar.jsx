import React from 'react';
import { Box, InputBase, useTheme } from '@mui/material';
import TagSelector from '../TagSelector';
import { PHONE_MEDIA } from '../../hooks/useNoteFormFactor';
import TypeIcon from './TypeIcon';
import { noteTypeMeta } from './noteTypeMeta';

/**
 * NoteMetaBar — the head of the page.
 *
 *   Row 1: [leading (Back)] ··················· [alert] [actions (⋯)]
 *   Row 2: the title, large, edited in place — no box, no label
 *   Row 3: the meta line: type glyph + name · `status` (the quiet save status)
 *   Row 4: tags, as a quiet inline field
 *   Row 5: `belowMeta` — the suggestion strip, when there is one
 *
 * Graphite moved the save status out of row 1: when things are fine it is
 * small lowercase metadata in row 3 ("saved · 3m ago"), and row 1 carries
 * only navigation and the menu. `alert` (SaveAlert) is the loud version and
 * renders nothing unless a save failed or unsaved work is stuck offline — so
 * the prime spot is only ever used for bad news.
 *
 * It sits inside NoteShell's text column, so the title, the toolbar and the
 * body share one left edge.
 */
function NoteMetaBar({
  title,
  onTitleChange,
  noteType,
  tags,
  onTagsChange,
  readOnly = false,
  leading = null,
  alert = null,
  status = null,
  actions = null,
  belowMeta = null,
  compact = false,
}) {
  const theme = useTheme();
  const meta = noteType ? noteTypeMeta(noteType) : null;

  return (
    <Box sx={{ pt: compact ? '4px' : '16px', pb: compact ? '8px' : '12px', ...(compact ? null : { [PHONE_MEDIA]: { pt: '4px' } }) }}>
      {/* ── Row 1: navigation and the menu ─────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: 44,
          mb: compact ? 0 : '12px',
          ...(compact ? null : { [PHONE_MEDIA]: { mb: '4px' } }),
          // Pull Back into the margin so its arrow, not its padding, sits on
          // the text column's edge.
          ml: leading ? '-10px' : 0,
        }}
      >
        {leading}
        <Box sx={{ flex: 1 }} />
        {alert}
        {actions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, mr: '-10px' }}>
            {actions}
          </Box>
        )}
      </Box>

      {/* ── Row 2: the title ───────────────────────────────────────── */}
      <InputBase
        value={title}
        onChange={(e) => onTitleChange?.(e.target.value)}
        disabled={readOnly}
        placeholder="Untitled note"
        fullWidth
        inputProps={{ 'aria-label': 'Note title' }}
        sx={{
          fontFamily: theme.typography.fontFamily,
          // Phone sizes under PHONE_MEDIA; a tablet (portrait too) gets the
          // desktop title — it has the room, and it was a phone's 26px line
          // at the top of an 800px page (tablet wave 2026-11-16).
          fontSize: compact ? '1.5rem' : '2.125rem',
          [PHONE_MEDIA]: { fontSize: compact ? '1.375rem' : '1.625rem' },
          fontWeight: 650,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          color: 'text.primary',
          // 44px for a finger (phone and tablet); ThemeModeProvider lets a
          // mouse have the compact field.
          minHeight: 44,
          '& .MuiInputBase-input': {
            p: 0,
            height: 'auto',
            // Restated on the <input>: the suite theme lifts every phone
            // input to 16px (iOS zoom guard), which would shrink the title
            // to body size exactly where it most needs to read as a title.
            fontSize: 'inherit',
            '&::placeholder': { color: 'text.secondary', opacity: 1 },
          },
          '&.Mui-disabled .MuiInputBase-input': {
            WebkitTextFillColor: theme.palette.text.primary,
          },
        }}
      />

      {/* ── Row 3: the meta line ───────────────────────────────────── */}
      {(meta || status) && (
        <Box
          data-note-meta
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '4px 8px',
            mt: '2px',
            minHeight: 20,
            color: 'text.secondary',
          }}
        >
          {meta && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <TypeIcon type={noteType} size={15} aria-hidden role={undefined} aria-label={undefined} />
              <Box component="span" sx={{ fontSize: '0.8125rem' }}>{meta.label}</Box>
            </Box>
          )}
          {meta && status && <Box component="span" aria-hidden sx={{ fontSize: '0.75rem' }}>·</Box>}
          {status}
        </Box>
      )}

      {/* ── Row 4: tags ────────────────────────────────────────────── */}
      <Box sx={{ mt: compact ? '2px' : '6px' }}>
        <TagSelector selectedTags={tags} onChange={onTagsChange} disabled={readOnly} />
      </Box>

      {/* ── Row 5: whatever the page wants under the title ─────────── */}
      {belowMeta}
    </Box>
  );
}

export default NoteMetaBar;
