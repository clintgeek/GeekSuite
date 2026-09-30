import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Divider, ListItemIcon, ListItemText, Menu, MenuItem, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { IMPORT_ENTRY, NEW_FRONT, NEW_MORE, newNotePath, noteTypeMeta } from '../notes/noteTypeMeta';
import { openImportPicker } from '../../store/importStore';
import { graphiteTokens } from '../../theme/tokens';

/**
 * NewNoteMenu — desktop's compact New: a split button in the top bar. The
 * main half makes a note (Markdown) in one click; the caret opens the other
 * kinds — photo, sketch, then code and mind map, then Markdown import.
 */
function NewNoteMenu() {
  const navigate = useNavigate();
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const [anchor, setAnchor] = useState(null);
  const go = (key) => { setAnchor(null); navigate(newNotePath(key)); };
  const others = NEW_FRONT.filter((k) => k !== 'markdown');

  const half = {
    minHeight: 36,
    minWidth: 0,
    bgcolor: g.hl,
    color: g.onHl,
    fontWeight: 650,
    boxShadow: 'none',
    '&:hover': { bgcolor: theme.palette.mode === 'dark' ? '#D4BB3C' : '#EDD43A', boxShadow: 'none' },
  };

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
      <Button
        variant="contained"
        onClick={() => go('markdown')}
        startIcon={<AddIcon />}
        sx={{ ...half, borderRadius: '8px 0 0 8px', pl: '12px', pr: '12px' }}
      >
        New note
      </Button>
      <Button
        variant="contained"
        aria-label="More kinds of note"
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ ...half, borderRadius: '0 8px 8px 0', px: '6px', borderLeft: `1px solid ${g.onHl}33` }}
      >
        <ExpandMore sx={{ fontSize: 20 }} />
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220, mt: '4px' } } }}
      >
        {[...others, 'divider', ...NEW_MORE, 'divider2', IMPORT_ENTRY.key].map((key) => {
          if (key.startsWith('divider')) return <Divider key={key} />;
          if (key === IMPORT_ENTRY.key) {
            const Icon = IMPORT_ENTRY.Icon;
            return (
              <MenuItem
                key={key}
                data-new-entry={key}
                onClick={() => { openImportPicker(); setAnchor(null); }}
              >
                <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
                <ListItemText secondary="or drop files on the page">Import Markdown files</ListItemText>
              </MenuItem>
            );
          }
          const meta = noteTypeMeta(key);
          const Icon = meta.Icon;
          return (
            <MenuItem key={key} onClick={() => go(key)} data-new-entry={key}>
              <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
              <ListItemText>{meta.long}</ListItemText>
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
}

export default NewNoteMenu;
