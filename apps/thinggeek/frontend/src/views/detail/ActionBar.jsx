/**
 * The action bar under a thing's name: Edit · Add photo · Add document ·
 * More. Four equal 52px targets with 12px labels. On a phone it pins to the
 * top of the page as you scroll (the page is a page now, not a sheet, so
 * there is no ✕ to keep clear of).
 *
 * Moving Day: the cab's switch panel — black in both modes (the chrome
 * theme), orange glyphs, an orange stripe along its foot.
 */
import React from 'react';
import { Box, Button } from '@mui/material';
import ChromeTheme from '../../components/Chrome';
import { CHROME, LIVERY } from '../../theme/theme';
import { AddAPhotoOutlined as PhotoIcon, EditOutlined as EditIcon, MoreHoriz as MoreIcon, NoteAddOutlined as DocumentIcon } from '@mui/icons-material';

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
  color: CHROME.text,
  borderRadius: '4px',
  '& .MuiSvgIcon-root': { fontSize: 21, color: LIVERY.orange },
  '&:hover': { bgcolor: 'rgba(244, 232, 212, 0.08)' },
};

export default function ActionBar({ onEdit, onAddPhoto, onAddDocument, onMore }) {
  return (
    <ChromeTheme>
      <Box
        data-testid="detail-actions"
        sx={{
          position: { xs: 'sticky', md: 'static' },
          top: 0,
          zIndex: 2,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 0.5,
          px: { xs: 1, md: 0.5 },
          pt: 0.5,
          pb: '9px',
          bgcolor: CHROME.bar,
          backgroundImage: `linear-gradient(0deg, ${LIVERY.orange} 0 3px, transparent 3px)`,
          borderRadius: { xs: 0, md: '4px' },
          overflow: 'hidden',
        }}
      >
        <Button onClick={onEdit} sx={BAR_BUTTON_SX}>
          <EditIcon />
          Edit
        </Button>
        {/* A phone column is ~70px: the add-glyph says "add", the word says what. */}
        <Button onClick={onAddPhoto} sx={BAR_BUTTON_SX} aria-label="Add photo">
          <PhotoIcon />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Add photo
          </Box>
          <Box component="span" aria-hidden="true" sx={{ display: { xs: 'inline', sm: 'none' } }}>
            Photo
          </Box>
        </Button>
        <Button onClick={onAddDocument} sx={BAR_BUTTON_SX} aria-label="Add document">
          <DocumentIcon />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Add document
          </Box>
          <Box component="span" aria-hidden="true" sx={{ display: { xs: 'inline', sm: 'none' } }}>
            Document
          </Box>
        </Button>
        <Button onClick={onMore} sx={BAR_BUTTON_SX} aria-label="More actions">
          <MoreIcon />
          More
        </Button>
      </Box>
    </ChromeTheme>
  );
}
