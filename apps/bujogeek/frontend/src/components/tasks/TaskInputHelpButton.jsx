import { useState } from 'react';
import { Box, IconButton, Popover, Typography, useTheme } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

/**
 * Token category colors — applied consistently in both the example sentence
 * and the reference grid so users learn the visual language instantly.
 */
const CATS = {
  date:  { light: { text: '#9a5f1a', bg: 'rgba(154,95,26,0.09)'  }, dark: { text: '#d4956a', bg: 'rgba(212,149,106,0.13)' } },
  pri:   { light: { text: '#b83c35', bg: 'rgba(184,60,53,0.09)'  }, dark: { text: '#e07b72', bg: 'rgba(224,123,114,0.13)' } },
  tag:   { light: { text: '#2563c7', bg: 'rgba(37,99,199,0.09)'  }, dark: { text: '#7aabf0', bg: 'rgba(122,171,240,0.13)' } },
  recur: { light: { text: '#1a7a68', bg: 'rgba(26,122,104,0.09)' }, dark: { text: '#5bbfad', bg: 'rgba(91,191,173,0.13)' } },
  note:  { light: { text: '#6b559a', bg: 'rgba(107,85,154,0.09)' }, dark: { text: '#a98fce', bg: 'rgba(169,143,206,0.13)' } },
  type:  { light: { text: '#7a5c38', bg: 'rgba(122,92,56,0.09)'  }, dark: { text: '#c4a882', bg: 'rgba(196,168,130,0.13)' } },
};

/** Inline colored token — used in the example sentence */
const T = ({ cat, isDark, children }) => {
  const c = CATS[cat][isDark ? 'dark' : 'light'];
  return (
    <Box
      component="span"
      sx={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 'inherit',
        color: c.text,
        backgroundColor: c.bg,
        px: '3px',
        py: '1px',
        borderRadius: '3px',
      }}
    >
      {children}
    </Box>
  );
};

/** Reference row: mono token badge + optional description */
const Ref = ({ token, desc, cat, isDark }) => {
  const c = CATS[cat][isDark ? 'dark' : 'light'];
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, py: '2px' }}>
      <Box
        component="span"
        sx={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.725rem',
          color: c.text,
          backgroundColor: c.bg,
          px: '5px',
          py: '1px',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {token}
      </Box>
      {desc && (
        <Typography
          component="span"
          sx={{
            fontSize: '0.725rem',
            color: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(44,24,16,0.45)',
            fontFamily: '"Source Sans 3", sans-serif',
            lineHeight: 1.35,
          }}
        >
          {desc}
        </Typography>
      )}
    </Box>
  );
};

/** Fraunces italic section label */
const Label = ({ isDark, children }) => (
  <Typography
    sx={{
      fontFamily: '"Fraunces", serif',
      fontStyle: 'italic',
      fontSize: '0.6875rem',
      fontWeight: 400,
      color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(44,24,16,0.38)',
      mb: 0.5,
      letterSpacing: '0.01em',
    }}
  >
    {children}
  </Typography>
);

/** Dotted rule divider */
const Rule = ({ isDark }) => (
  <Box
    sx={{
      borderTop: `1px dotted ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(44,24,16,0.15)'}`,
      my: 1.25,
    }}
  />
);

const TaskInputHelpButton = ({ compact = false }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const open = Boolean(anchorEl);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const paperBg   = isDark ? '#1e1510' : '#fefaf5';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(44,24,16,0.11)';

  return (
    <>
      {compact ? (
        <IconButton
          size="small"
          onClick={handleOpen}
          aria-label="Show task input syntax"
          sx={{
            color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(44,24,16,0.28)',
            '&:hover': {
              color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(44,24,16,0.65)',
              backgroundColor: 'transparent',
            },
          }}
        >
          <HelpOutlineIcon sx={{ fontSize: 15 }} />
        </IconButton>
      ) : (
        <Box
          component="button"
          onClick={handleOpen}
          sx={{
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontSize: '0.8125rem',
            color: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(44,24,16,0.38)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            p: 0,
            '&:hover': { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(44,24,16,0.7)' },
          }}
        >
          syntax guide
        </Box>
      )}

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          elevation: 0,
          sx: {
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: paperBg,
            border: `1px solid ${borderCol}`,
            borderRadius: '10px',
            p: 0,
            overflow: 'hidden',
            boxShadow: isDark
              ? '0 12px 40px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)'
              : '0 8px 32px rgba(44,24,16,0.11), 0 2px 6px rgba(44,24,16,0.06)',
          },
        }}
      >
        {/* ── Header: title + live example ─────────────────── */}
        <Box
          sx={{
            px: 2,
            pt: 1.75,
            pb: 1.5,
            borderBottom: `1px dotted ${borderCol}`,
          }}
        >
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.75rem',
              color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(44,24,16,0.32)',
              mb: 0.75,
              letterSpacing: '0.015em',
            }}
          >
            Quick-add syntax — all tokens optional
          </Typography>

          {/* Live example sentence with color-coded tokens */}
          <Box
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.6875rem',
              lineHeight: 1.8,
              color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(44,24,16,0.5)',
              letterSpacing: '-0.01em',
              wordBreak: 'break-word',
            }}
          >
            <span>Call dentist </span>
            <T cat="date" isDark={isDark}>/tomorrow 9am</T>
            {'  '}
            <T cat="pri" isDark={isDark}>!high</T>
            {'  '}
            <T cat="tag" isDark={isDark}>#health</T>
            {'  '}
            <T cat="recur" isDark={isDark}>(weekly)</T>
            {'  '}
            <T cat="note" isDark={isDark}>^confirm appt</T>
          </Box>
        </Box>

        {/* ── Reference grid ────────────────────────────────── */}
        <Box sx={{ px: 2, py: 1.5 }}>

          {/* Row 1: When + Priority / Recurrence */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box>
              <Label isDark={isDark}>when</Label>
              <Ref token="/tomorrow"   desc="tomorrow"         cat="date"  isDark={isDark} />
              <Ref token="/monday"     desc="next occurrence"  cat="date"  isDark={isDark} />
              <Ref token="/next-week"  desc="+7 days"          cat="date"  isDark={isDark} />
              <Ref token="/mar 5th"    desc="specific date"    cat="date"  isDark={isDark} />
              <Ref token="9am · 2:30pm" desc="time after date" cat="date"  isDark={isDark} />
            </Box>

            <Box>
              <Label isDark={isDark}>priority</Label>
              <Ref token="!high"   cat="pri"   isDark={isDark} />
              <Ref token="!medium" cat="pri"   isDark={isDark} />
              <Ref token="!low"    cat="pri"   isDark={isDark} />

              <Box sx={{ mt: 1.25 }}>
                <Label isDark={isDark}>repeat</Label>
                <Ref token="(daily)"   cat="recur" isDark={isDark} />
                <Ref token="(weekly)"  cat="recur" isDark={isDark} />
                <Ref token="(monthly)" cat="recur" isDark={isDark} />
              </Box>
            </Box>
          </Box>

          <Rule isDark={isDark} />

          {/* Row 2: Tags + Note */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box>
              <Label isDark={isDark}>tag</Label>
              <Ref token="#work" desc="any word" cat="tag" isDark={isDark} />
            </Box>
            <Box>
              <Label isDark={isDark}>note</Label>
              <Ref token="^text" desc="attaches to task" cat="note" isDark={isDark} />
            </Box>
          </Box>

          <Rule isDark={isDark} />

          {/* Row 3: Entry types — inline chips */}
          <Label isDark={isDark}>entry type (first character)</Label>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Ref token="@" desc="event"    cat="type" isDark={isDark} />
            <Ref token="-" desc="note"     cat="type" isDark={isDark} />
            <Ref token="?" desc="question" cat="type" isDark={isDark} />
          </Box>

          {/* Footnote: NoteGeek cross-save */}
          <Box
            sx={{
              mt: 1.5,
              pt: 1.25,
              borderTop: `1px dotted ${borderCol}`,
              display: 'flex',
              alignItems: 'baseline',
              gap: 0.75,
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.6875rem',
                color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(44,24,16,0.25)',
                flexShrink: 0,
              }}
            >
              $^note text
            </Box>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontFamily: '"Source Sans 3", sans-serif',
                fontStyle: 'italic',
                color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(44,24,16,0.25)',
              }}
            >
              also saves to NoteGeek
            </Typography>
          </Box>
        </Box>
      </Popover>
    </>
  );
};

export default TaskInputHelpButton;
