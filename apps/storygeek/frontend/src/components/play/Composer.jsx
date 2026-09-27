import { useState } from 'react';
import {
  Box, TextField, Button, CircularProgress, IconButton, Menu, MenuItem,
  ListItemText, Typography, Tooltip, alpha, useTheme,
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import { slashFocusProps } from '@geeksuite/ui';
import { COMMANDS, applyCommand } from '../../game/transcript';
import { fonts } from '../../theme/theme';

/**
 * Composer — "What do you do?", pinned under the page.
 *
 * The play column is a flex box that the shell sizes to the visual viewport
 * (index.html asks for `interactive-widget=resizes-content`), so this row
 * rides on top of the phone keyboard rather than under it. It pads the
 * home-indicator inset itself.
 *
 * The Commands button replaces the 12px "/recall /checkpoint …" line that sat
 * under the old composer: the same commands, as 44px targets with a sentence
 * each. Picking one only writes it into the box — the player still sends.
 */
export default function Composer({ value, onChange, onSubmit, loading, inputRef, showHint }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  const [menuAnchor, setMenuAnchor] = useState(null);

  const pick = (command) => {
    setMenuAnchor(null);
    const next = applyCommand(value, command);
    onChange(next);
    // After the menu has closed and handed focus back.
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      try {
        el.focus();
        el.setSelectionRange(next.length, next.length);
      } catch (_) { /* not a text input in this environment */ }
    }, 0);
  };

  return (
    <Box sx={{
      flexShrink: 0,
      px: { xs: 1.5, md: 2 },
      pt: { xs: 1, md: 1.5 },
      pb: { xs: 'calc(8px + env(safe-area-inset-bottom))', md: 1.5 },
      borderTop: `1px solid ${c.rule}`,
      backgroundColor: alpha(c.table, 0.92),
      backdropFilter: 'blur(8px)',
    }}>
      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', maxWidth: 820, mx: 'auto' }}
      >
        <Tooltip title="Commands">
          <span>
            <IconButton
              aria-label="Commands"
              aria-haspopup="menu"
              aria-expanded={menuAnchor ? 'true' : undefined}
              disabled={loading}
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{
                width: 48, height: 48, borderRadius: '12px', flexShrink: 0,
                border: `1px solid ${c.rule}`, color: c.accentLabel,
                fontFamily: fonts.display, fontWeight: 700, fontSize: '1.35rem', lineHeight: 1,
              }}
            >
              /
            </IconButton>
          </span>
        </Tooltip>

        <TextField
          fullWidth
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!loading && value.trim()) onSubmit(e);
            }
          }}
          placeholder="What do you do?"
          disabled={loading}
          inputRef={inputRef}
          // `/` (suite slash focus) lands here — the turn is the page. No
          // select: a half-written action is not a query to replace. A `/`
          // typed *in* the box is still the start of /recall, /end, etc.
          inputProps={{ ...slashFocusProps(30, { select: false }), 'aria-label': 'Your action' }}
          multiline
          minRows={1}
          maxRows={5}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontFamily: fonts.text,
              fontSize: '1.0625rem',
              lineHeight: 1.5,
              borderRadius: '12px',
              py: 1.25,
              px: 1.75,
              backgroundColor: c.page,
              alignItems: 'flex-start',
            },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: c.accent,
              borderWidth: 2,
            },
          }}
        />

        {/* Icon-only: the aria-label is the button's whole name. */}
        <Button
          type="submit"
          variant="contained"
          aria-label="Send"
          disabled={loading || !value.trim()}
          sx={{ minWidth: 48, width: 48, height: 48, borderRadius: '12px', px: 0, flexShrink: 0 }}
        >
          {loading ? <CircularProgress size={20} aria-hidden="true" sx={{ color: 'inherit' }} /> : <SendIcon />}
        </Button>
      </Box>

      {showHint && (
        <Typography sx={{
          maxWidth: 820, mx: 'auto', mt: 0.75, pl: 7, fontFamily: fonts.ui,
          fontSize: '0.8125rem', color: 'text.secondary',
        }}>
          Enter to act · Shift + Enter for a new line · the / button lists commands
        </Typography>
      )}

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { maxWidth: 360, width: 'calc(100vw - 32px)' } } }}
        MenuListProps={{ 'aria-label': 'Commands', dense: false }}
      >
        {COMMANDS.map((cmd) => (
          <MenuItem key={cmd.command} onClick={() => pick(cmd.command)} sx={{ minHeight: 48, alignItems: 'flex-start', py: 1 }}>
            <ListItemText
              primary={cmd.command}
              primaryTypographyProps={{ sx: { fontFamily: fonts.ui, fontWeight: 700, color: c.accent } }}
              secondary={cmd.hint}
              secondaryTypographyProps={{ sx: { fontFamily: fonts.ui, fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'normal' } }}
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
