import React, { useState } from 'react';
import {
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { glow, tapTarget44 } from '../../theme/tokens';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Edit from '@mui/icons-material/Edit';
import AutoAwesomeMosaic from '@mui/icons-material/AutoAwesomeMosaic';
import HistoryIcon from '@mui/icons-material/History';
import Visibility from '@mui/icons-material/Visibility';
import ArrowBack from '@mui/icons-material/ArrowBack';
import TextSnippetOutlined from '@mui/icons-material/TextSnippetOutlined';
import PushPin from '@mui/icons-material/PushPin';
import PushPinOutlined from '@mui/icons-material/PushPinOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import CallMerge from '@mui/icons-material/CallMerge';

const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent || '');
const SAVE_SHORTCUT = isMac ? '⌘S' : 'Ctrl+S';
const PRINT_SHORTCUT = isMac ? '⌘P' : 'Ctrl+P';

/**
 * NoteActions — the editor's quiet controls.
 *
 * The page autosaves, so there is no Save button any more (the SaveStamp
 * shows where that stands). What remains:
 *
 *   - `BackButton` — flushes a pending save and leaves (the page's handler).
 *   - the View/Edit toggle, for mind maps only — a mode, not an action.
 *   - the ⋯ menu: Save now, Print or save as PDF, Pin, Version history,
 *     Fold in new info (saved Markdown notes), Compose, Convert handwriting
 *     to text (sketches only), Delete.
 *
 * The ⋯ menu only calls the page's handlers. It does not mount anything:
 * `NoteHistoryDialog` stays mounted by the page, and only while open (its
 * `useLazyQuery` needs an Apollo client even when skipped).
 */
export function BackButton({ onBack }) {
  const theme = useTheme();
  return (
    <Button
      variant="text"
      color="inherit"
      onClick={onBack}
      aria-label="Back"
      size="small"
      sx={{
        color: 'text.secondary',
        minWidth: 0,
        px: '6px',
        gap: '4px',
        fontFamily: theme.typography.fontFamilyMono,
        fontSize: '0.75rem',
        fontWeight: 500,
        letterSpacing: '0.04em',
        [theme.breakpoints.down('md')]: { ...tapTarget44 },
        '&:hover': { color: 'text.primary', bgcolor: glow(theme).soft },
      }}
    >
      <ArrowBack sx={{ fontSize: 16 }} />
      <span className="back-label">Back</span>
    </Button>
  );
}

function NoteActions({
  onSave,
  onDelete,
  onToggleEdit,
  canDelete = true,
  canToggleEdit = false,
  isEditMode = true,
  // Compose is offered only when the page can act on the result; no
  // handler means no menu item, so a note type that cannot be composed does
  // not advertise it.
  onCompose,
  isComposing = false,
  // Fold-in (DOCS/CONTEXT.md §13): saved Markdown notes only — the page
  // decides and passes no handler otherwise.
  onFoldIn,
  onHistory,
  // Pin / unpin. Offered only when the handler is passed (a brand-new,
  // never-saved note has nothing to pin yet — see NoteEditorPage). The
  // label and icon flip on `pinned`; a menu item, not a toggle switch, so
  // it reads the same way "Save now" and "Delete" do.
  onPin,
  pinned = false,
  isPinning = false,
  // Sketches only (DOCS/HANDWRITING.md §2). Offered whenever the handler is
  // passed; disabled while the sketch is empty, so the entry is still
  // discoverable on a blank page.
  onTranscribe,
  canTranscribe = false,
  isTranscribing = false,
  // Print / Save as PDF (hooks/useNotePrint.js). The browser's print
  // dialog is where "Save as PDF" lives, on Android and desktop alike, so
  // one item says both.
  onPrint,
  isPrinting = false,
  // An autosaved-but-never-navigated note is still a real row; the page
  // decides whether "Delete" means delete or discard.
  deleteLabel = 'Delete note',
}) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);
  const run = (fn) => () => {
    close();
    fn?.();
  };

  const itemSx = {
    gap: 0,
    minHeight: 40,
    [theme.breakpoints.down('md')]: { minHeight: 44 },
    '& .MuiListItemIcon-root': { minWidth: 32, color: 'text.secondary' },
    '& .MuiListItemText-primary': { fontSize: '0.875rem' },
  };

  return (
    <>
      {canToggleEdit && (
        <Button
          variant="text"
          color="primary"
          startIcon={isEditMode ? <Visibility /> : <Edit />}
          onClick={onToggleEdit}
          size="small"
          sx={{ [theme.breakpoints.down('md')]: { ...tapTarget44 } }}
        >
          {isEditMode ? 'View' : 'Edit'}
        </Button>
      )}

      <IconButton
        aria-label="More note actions"
        aria-haspopup="menu"
        aria-expanded={open || undefined}
        aria-controls={open ? 'note-actions-menu' : undefined}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        size="small"
        sx={{
          color: 'text.secondary',
          borderRadius: '6px',
          minWidth: 32,
          minHeight: 32,
          [theme.breakpoints.down('md')]: { ...tapTarget44 },
          '&:hover': { bgcolor: glow(theme).soft, color: 'text.primary' },
          '&:focus-visible': { boxShadow: `0 0 0 3px ${glow(theme).ring}` },
        }}
      >
        {isComposing || isTranscribing || isPrinting ? <CircularProgress size={16} color="inherit" /> : <MoreHoriz fontSize="small" />}
      </IconButton>

      <Menu
        id="note-actions-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 232, mt: '4px' } } }}
      >
        {isEditMode && onSave && (
          <MenuItem onClick={run(onSave)} sx={itemSx}>
            <ListItemIcon><SaveOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Save now</ListItemText>
            <Typography
              variant="caption"
              aria-hidden
              sx={{ ml: 2, color: 'text.secondary', display: { xs: 'none', md: 'inline' } }}
            >
              {SAVE_SHORTCUT}
            </Typography>
          </MenuItem>
        )}
        {onPrint && (
          <MenuItem onClick={run(onPrint)} disabled={isPrinting} sx={itemSx}>
            <ListItemIcon><PrintOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Print or save as PDF</ListItemText>
            <Typography
              variant="caption"
              aria-hidden
              sx={{ ml: 2, color: 'text.secondary', display: { xs: 'none', md: 'inline' } }}
            >
              {PRINT_SHORTCUT}
            </Typography>
          </MenuItem>
        )}
        {onPin && (
          <MenuItem onClick={run(onPin)} disabled={isPinning} sx={itemSx}>
            <ListItemIcon>
              {pinned ? <PushPin fontSize="small" /> : <PushPinOutlined fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{pinned ? 'Unpin' : 'Pin'}</ListItemText>
          </MenuItem>
        )}
        {onHistory && (
          <MenuItem onClick={run(onHistory)} sx={itemSx}>
            <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Version history</ListItemText>
          </MenuItem>
        )}
        {onFoldIn && (
          <MenuItem onClick={run(onFoldIn)} sx={itemSx}>
            <ListItemIcon><CallMerge fontSize="small" /></ListItemIcon>
            <ListItemText>Fold in new info</ListItemText>
          </MenuItem>
        )}
        {onCompose && (
          <MenuItem
            onClick={run(onCompose)}
            disabled={isComposing}
            sx={itemSx}
            aria-label="Compose a document from this note"
          >
            <ListItemIcon><AutoAwesomeMosaic fontSize="small" /></ListItemIcon>
            <ListItemText>Compose a document</ListItemText>
          </MenuItem>
        )}
        {onTranscribe && (
          <MenuItem
            onClick={run(onTranscribe)}
            disabled={!canTranscribe || isTranscribing}
            sx={itemSx}
          >
            <ListItemIcon><TextSnippetOutlined fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="Convert handwriting to text"
              secondary={canTranscribe ? null : 'Write something first'}
              secondaryTypographyProps={{ sx: { fontFamily: theme.typography.fontFamilyMono, fontSize: '0.75rem' } }}
            />
          </MenuItem>
        )}
        {canDelete && onDelete && [
          <Divider key="d" sx={{ my: '4px !important' }} />,
          <MenuItem
            key="delete"
            onClick={run(onDelete)}
            sx={{
              ...itemSx,
              color: 'error.main',
              '& .MuiListItemIcon-root': { minWidth: 32, color: 'error.main' },
            }}
          >
            <ListItemIcon><DeleteOutline fontSize="small" /></ListItemIcon>
            <ListItemText>{deleteLabel}</ListItemText>
          </MenuItem>,
        ]}
      </Menu>
    </>
  );
}

export default NoteActions;
