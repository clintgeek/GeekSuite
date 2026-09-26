/**
 * The sticky action bar under the gallery: Edit · Add photo · Add document
 * · More. Four equal 52px targets with 12px labels, pinned as the sheet
 * scrolls.
 */
import React from 'react';
import { Box, Button } from '@mui/material';
import {
  AddAPhotoOutlined as PhotoIcon,
  EditOutlined as EditIcon,
  MoreHoriz as MoreIcon,
  NoteAddOutlined as DocumentIcon,
} from '@mui/icons-material';

const BAR_BUTTON_SX = {
  minWidth: 0,
  minHeight: 52,
  px: 0.5,
  py: 0.75,
  flexDirection: 'column',
  gap: 0.25,
  fontSize: '0.75rem',
  fontWeight: 600,
  lineHeight: 1.2,
  color: 'text.primary',
  borderRadius: '10px',
  '& .MuiSvgIcon-root': { fontSize: 20 },
};

export default function ActionBar({ onEdit, onAddPhoto, onAddDocument, onMore }) {
  return (
    <Box
      data-testid="detail-actions"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 0.5,
        // The sheet's ✕ floats top-right; when the bar is pinned it must not sit under it.
        pl: { xs: 1, md: 2 },
        pr: { xs: 7.5, md: 8 },
        py: 0.5,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Button onClick={onEdit} sx={BAR_BUTTON_SX}>
        <EditIcon sx={{ color: 'primary.main' }} />
        Edit
      </Button>
      {/* A phone column is ~70px: the add-glyph says "add", the word says what. */}
      <Button onClick={onAddPhoto} sx={BAR_BUTTON_SX} aria-label="Add photo">
        <PhotoIcon sx={{ color: 'primary.main' }} />
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Add photo</Box>
        <Box component="span" aria-hidden="true" sx={{ display: { xs: 'inline', sm: 'none' } }}>Photo</Box>
      </Button>
      <Button onClick={onAddDocument} sx={BAR_BUTTON_SX} aria-label="Add document">
        <DocumentIcon sx={{ color: 'primary.main' }} />
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Add document</Box>
        <Box component="span" aria-hidden="true" sx={{ display: { xs: 'inline', sm: 'none' } }}>Document</Box>
      </Button>
      <Button onClick={onMore} sx={BAR_BUTTON_SX} aria-label="More actions">
        <MoreIcon />
        More
      </Button>
    </Box>
  );
}
