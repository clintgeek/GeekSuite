import React from 'react';
import { Box, InputBase, Stack, Typography, useTheme } from '@mui/material';
import TagSelector from '../TagSelector';

// Type config — labels are ALLCAPS (ink-stamp mono style)
// Color comes from theme.palette.noteTypes[colorKey]
const TYPE_CONFIG = {
  text:        { label: 'RICH TEXT',  colorKey: 'text' },
  markdown:    { label: 'MARKDOWN',   colorKey: 'markdown' },
  code:        { label: 'CODE',       colorKey: 'code' },
  mindmap:     { label: 'MINDMAP',    colorKey: 'mindmap' },
  handwritten: { label: 'SKETCH',     colorKey: 'handwritten' },
};

/**
 * NoteMetaBar — Title input + type pill + tag chips.
 * Lives in the sticky header slot of NoteShell on `surfaces.paper`.
 *
 * Layout:
 *   Row 1: [title input (full width)]
 *   Row 2: [type pill]  [tag chips flowing right]  [desktop actions]
 */
function NoteMetaBar({
  title,
  onTitleChange,
  noteType,
  tags,
  onTagsChange,
  readOnly = false,
  dirty = false,
  actions,
}) {
  const theme = useTheme();
  const typeConfig = TYPE_CONFIG[noteType] || TYPE_CONFIG.text;
  const typeColor = theme.palette.noteTypes?.[typeConfig.colorKey] || theme.palette.primary.main;

  return (
    <Box sx={{ px: { xs: 1.5, sm: 2 }, py: { xs: 1.25, sm: 1.5 } }}>

      {/* ── Row 1: Title input ─────────────────────────────────────── */}
      <Box
        sx={{
          mb: 1.25,
          borderRadius: '4px',
          transition: 'box-shadow 120ms ease',
          '&:focus-within': {
            boxShadow: `0 0 0 3px ${theme.palette.glow.ring}`,
          },
        }}
      >
        <InputBase
          value={title}
          onChange={(e) => onTitleChange?.(e.target.value)}
          disabled={readOnly}
          placeholder="Untitled note"
          fullWidth
          inputProps={{ 'aria-label': 'Note title' }}
          sx={{
            fontSize: '1.25rem',
            fontWeight: 600,
            fontFamily: theme.typography.fontFamily,
            letterSpacing: '-0.015em',
            lineHeight: 1.3,
            color: 'text.primary',
            // No border, no underline — the focus ring on the parent is enough
            '& .MuiInputBase-input': {
              py: 0,
              px: 0,
              bgcolor: 'transparent',
              '&::placeholder': {
                color: 'text.disabled',
                fontStyle: 'italic',
                opacity: 1,
              },
            },
          }}
        />
      </Box>

      {/* ── Row 2: Type pill + tags + desktop actions ──────────────── */}
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        flexWrap="wrap"
        sx={{ gap: 1 }}
      >
        {/* Type indicator pill */}
        {noteType && (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.625,
              px: 0.875,
              py: 0.25,
              borderRadius: '4px',
              border: `1px solid ${theme.palette.border}`,
              bgcolor: theme.palette.glow.soft,
              flexShrink: 0,
            }}
          >
            {/* Color dot */}
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: typeColor,
                flexShrink: 0,
              }}
            />
            <Typography
              variant="caption"
              sx={{
                color: typeColor,
                lineHeight: 1,
                letterSpacing: '0.04em',
              }}
            >
              {typeConfig.label}
            </Typography>
          </Box>
        )}

        {/* Unsaved-changes indicator */}
        {dirty && (
          <Typography
            variant="caption"
            sx={{
              color: 'primary.main',
              flexShrink: 0,
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            ● Edited
          </Typography>
        )}

        {/* Tag selector */}
        <Box sx={{ flexGrow: 1, minWidth: 120 }}>
          <TagSelector
            selectedTags={tags}
            onChange={onTagsChange}
            disabled={readOnly}
          />
        </Box>

        {/* Desktop-only actions (Save/Cancel/Delete) */}
        {actions && (
          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              gap: 1,
              flexShrink: 0,
              alignItems: 'center',
            }}
          >
            {actions}
          </Box>
        )}
      </Stack>
    </Box>
  );
}

export default NoteMetaBar;
