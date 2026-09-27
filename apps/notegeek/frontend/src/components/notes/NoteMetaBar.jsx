import React from 'react';
import { Box, InputBase, useTheme } from '@mui/material';
import TagSelector from '../TagSelector';
import TypeStamp from './TypeStamp';

/**
 * NoteMetaBar — the head of the page: a chrome line, the title, the tags.
 *
 *   Row 1: [leading (Back)] [type stamp] ·········· [status (save stamp)] [actions (⋯)]
 *   Row 2: the title, large, edited in place — no box, no label
 *   Row 3: tags, as a quiet inline field
 *   Row 4: `belowMeta` — the suggestion strip, when there is one
 *
 * It sits inside NoteShell's text column, so the title, the toolbar and the
 * body all share one left edge. Row 4 is a slot rather than a component
 * because the strip needs the editor page's state (the body, the save token,
 * the tag setter) and the meta bar has no business knowing about any of it.
 */
function NoteMetaBar({
  title,
  onTitleChange,
  noteType,
  tags,
  onTagsChange,
  readOnly = false,
  leading = null,
  status = null,
  actions = null,
  belowMeta = null,
  compact = false,
}) {
  const theme = useTheme();

  return (
    <Box sx={{ pt: compact ? '8px' : { xs: '8px', md: '16px' }, pb: compact ? '8px' : '12px' }}>
      {/* ── Row 1: chrome line ─────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: 36,
          mb: compact ? '4px' : { xs: '8px', md: '16px' },
          // Pull Back into the margin so its arrow, not its padding, sits on
          // the text column's edge.
          ml: leading ? '-6px' : 0,
        }}
      >
        {leading}
        {noteType && <TypeStamp type={noteType} />}
        <Box sx={{ flex: 1 }} />
        {status}
        {actions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, mr: '-6px' }}>
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
          fontSize: compact ? { xs: '1.375rem', md: '1.5rem' } : { xs: '1.625rem', md: '2.125rem' },
          fontWeight: 700,
          letterSpacing: '-0.025em',
          lineHeight: 1.2,
          color: 'text.primary',
          minHeight: 44,
          '& .MuiInputBase-input': {
            p: 0,
            height: 'auto',
            // Restated on the <input>: the suite theme lifts every phone
            // input to 16px (iOS zoom guard), which would shrink the title
            // to body size exactly where it most needs to read as a title.
            fontSize: 'inherit',
            '&::placeholder': { color: 'text.secondary', opacity: 0.7 },
          },
          '&.Mui-disabled .MuiInputBase-input': {
            WebkitTextFillColor: theme.palette.text.primary,
          },
          // A pencil line under the title while it has focus — the only
          // affordance it needs.
          borderBottom: '1px solid transparent',
          transition: 'border-color 120ms ease',
          '&.Mui-focused': { borderBottomColor: theme.palette.divider },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      />

      {/* ── Row 3: tags ────────────────────────────────────────────── */}
      <Box sx={{ mt: compact ? '4px' : '8px' }}>
        <TagSelector selectedTags={tags} onChange={onTagsChange} disabled={readOnly} />
      </Box>

      {/* ── Row 4: whatever the page wants under the title ─────────── */}
      {belowMeta}
    </Box>
  );
}

export default NoteMetaBar;
