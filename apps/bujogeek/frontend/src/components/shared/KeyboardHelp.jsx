import { Box, Typography, Dialog, DialogContent, IconButton, useTheme } from '@mui/material';
import { X } from 'lucide-react';
import { colors } from '../../theme/colors';

/**
 * KeyboardHelp — the shortcut reference overlay.
 *
 * Triggered by pressing `?` anywhere in the app, or by a help icon.
 * Organized by context: Navigation, Today, Review, Quick Entry.
 * Key badges use IBM Plex Mono, descriptions in Source Sans.
 * Fraunces serif title. Dotted dividers between sections.
 */

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['g', 't'], desc: 'Go to Today' },
      { keys: ['g', 'r'], desc: 'Go to Review' },
      { keys: ['g', 'p'], desc: 'Go to Plan' },
      { keys: ['⌘', 'K'], desc: 'Command palette' },
      { keys: ['⌘', 'N'], desc: 'Focus quick-add input' },
    ],
  },
  {
    title: 'Task List',
    shortcuts: [
      { keys: ['j'], desc: 'Move focus down' },
      { keys: ['k'], desc: 'Move focus up' },
      { keys: ['x'], desc: 'Toggle complete' },
      { keys: ['e'], desc: 'Edit task' },
      { keys: ['d'], desc: 'Delete task' },
      { keys: ['Esc'], desc: 'Clear focus' },
    ],
  },
  {
    title: 'Review',
    shortcuts: [
      { keys: ['1'], desc: 'Keep today' },
      { keys: ['2'], desc: 'Move to tomorrow' },
      { keys: ['3'], desc: 'Send to backlog' },
      { keys: ['d'], desc: 'Delete task' },
    ],
  },
  {
    title: 'Quick Entry Syntax',
    shortcuts: [
      { keys: ['#tag'], desc: 'Add tag' },
      { keys: ['!high'], desc: 'Set priority (high/medium/low)' },
      { keys: ['/tomorrow'], desc: 'Set due date' },
      { keys: ['^note'], desc: 'Add a note' },
      { keys: ['$^text'], desc: 'Save note to NoteGeek' },
    ],
  },
];

const KeyBadge = ({ children }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      component="kbd"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.6875rem',
        fontWeight: 500,
        lineHeight: 1,
        minWidth: 24,
        px: 0.75,
        py: 0.5,
        borderRadius: '5px',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : colors.ink[200]}`,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.ink[50],
        color: isDark ? 'rgba(255,255,255,0.85)' : colors.ink[800],
        boxShadow: isDark
          ? 'none'
          : `0 1px 2px ${colors.ink[200]}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
};

const KeyboardHelp = ({ open, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const primaryInk = theme.palette.text.primary;
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '85vh',
          backgroundColor: theme.palette.background.paper,
        },
      }}
    >
      <DialogContent sx={{ px: { xs: 3, sm: 4 }, py: { xs: 3, sm: 3.5 } }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 3,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontSize: '0.8125rem',
                fontWeight: 400,
                color: captionInk,
                letterSpacing: '0.01em',
                mb: 0.5,
              }}
            >
              Quick reference
            </Typography>
            <Typography
              component="h2"
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: { xs: '1.5rem', sm: '1.75rem' },
                fontWeight: 500,
                color: primaryInk,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              }}
            >
              Keyboard Shortcuts
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            size="small"
            aria-label="Close"
            sx={{
              color: mutedInk,
              mt: 0.5,
              '&:hover': { color: primaryInk },
            }}
          >
            <X size={18} />
          </IconButton>
        </Box>

        {/* Shortcut groups */}
        {SHORTCUT_GROUPS.map((group, groupIdx) => (
          <Box key={group.title} sx={{ mb: groupIdx < SHORTCUT_GROUPS.length - 1 ? 3 : 0 }}>
            {/* Group header */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <Typography
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontSize: '1rem',
                  fontWeight: 500,
                  color: primaryInk,
                  letterSpacing: '-0.005em',
                  whiteSpace: 'nowrap',
                }}
              >
                {group.title}
              </Typography>
              <Box sx={{ flex: 1, borderTop: dottedRule }} />
            </Box>

            {/* Shortcuts */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.shortcuts.map((shortcut) => (
                <Box
                  key={shortcut.desc}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    py: 0.375,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.875rem',
                      color: isDark ? 'rgba(255,255,255,0.75)' : colors.ink[700],
                      flex: 1,
                    }}
                  >
                    {shortcut.desc}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 0.5,
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {shortcut.keys.map((key, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.375 }}>
                        {i > 0 && (
                          <Typography
                            sx={{
                              fontSize: '0.625rem',
                              color: mutedInk,
                              fontWeight: 500,
                            }}
                          >
                            then
                          </Typography>
                        )}
                        <KeyBadge>{key}</KeyBadge>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}

        {/* Footer hint */}
        <Box
          sx={{
            mt: 3,
            pt: 2,
            borderTop: dottedRule,
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.75rem',
              color: captionInk,
            }}
          >
            Press <KeyBadge>?</KeyBadge> anytime to show this reference
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardHelp;
