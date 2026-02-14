import React from 'react';
import { Box, TextField, Chip, Stack, alpha, useTheme } from '@mui/material';
import {
  TextFields as TextIcon,
  Description as MarkdownIcon,
  Code as CodeIcon,
  AccountTree as MindMapIcon,
  Draw as HandwrittenIcon,
} from '@mui/icons-material';
import TagSelector from '../TagSelector';

// Type configuration — Studio Ink palette
const TYPE_CONFIG = {
  text: { icon: TextIcon, label: 'Rich Text', color: '#5B50A8' },
  markdown: { icon: MarkdownIcon, label: 'Markdown', color: '#7B5DAE' },
  code: { icon: CodeIcon, label: 'Code', color: '#4A8C6F' },
  mindmap: { icon: MindMapIcon, label: 'Mind Map', color: '#3D8493' },
  handwritten: { icon: HandwrittenIcon, label: 'Sketch', color: '#A85C73' },
};

/**
 * NoteMetaBar - Title input, type badge, and tag selector
 * Used in header slot of NoteShell
 */
function NoteMetaBar({
  title,
  onTitleChange,
  noteType,
  tags,
  onTagsChange,
  readOnly = false,
  actions,      // Optional inline actions (save button on desktop)
}) {
  const theme = useTheme();
  const typeConfig = TYPE_CONFIG[noteType] || TYPE_CONFIG.text;
  const TypeIcon = typeConfig.icon;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
      {/* Row 1: Title + Type badge/selector */}
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ mb: 1.5 }}
      >
        {/* Title with type indicator bar */}
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <TextField
            placeholder="Note title..."
            value={title}
            onChange={(e) => onTitleChange?.(e.target.value)}
            disabled={readOnly}
            size="small"
            variant="outlined"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: alpha(theme.palette.background.default, 0.6),
                borderRadius: 2,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                fontSize: '1.1rem',
                fontWeight: 500,
                pl: 1.5,
                '& fieldset': {
                  borderColor: alpha(theme.palette.divider, 0.5),
                  borderWidth: 1,
                },
                '&:hover fieldset': {
                  borderColor: alpha(typeConfig.color, 0.5),
                },
                '&.Mui-focused fieldset': {
                  borderColor: typeConfig.color,
                  borderWidth: 2,
                },
                // Colored left bar indicator
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 3,
                  height: '60%',
                  bgcolor: typeConfig.color,
                  borderRadius: 1.5,
                },
              },
              '& .MuiOutlinedInput-input': {
                py: 1.25,
              },
            }}
            inputProps={{
              'aria-label': 'Note title',
            }}
          />
        </Box>

        {/* Type badge */}
        {noteType && (
          <Chip
            icon={<TypeIcon sx={{ fontSize: 16 }} />}
            label={typeConfig.label}
            size="small"
            sx={{
              bgcolor: alpha(typeConfig.color, 0.1),
              color: typeConfig.color,
              border: `1px solid ${alpha(typeConfig.color, 0.3)}`,
              fontWeight: 600,
              fontSize: '0.75rem',
              height: 28,
              '& .MuiChip-icon': {
                color: 'inherit',
              },
            }}
          />
        )}
      </Stack>

      {/* Row 2: Tags + Actions */}
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        justifyContent="space-between"
      >
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <TagSelector
            selectedTags={tags}
            onChange={onTagsChange}
            disabled={readOnly}
          />
        </Box>

        {/* Desktop actions (hidden on mobile, shown in bottom bar instead) */}
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
