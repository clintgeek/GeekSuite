import { Box, Typography, IconButton, useTheme } from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, isToday, isYesterday, isTomorrow } from 'date-fns';
import { motion } from 'framer-motion';
import { colors } from '../../theme/colors';

/**
 * PageHeader — the daily planner masthead.
 *
 * Hierarchy:
 *   1. Greeting eyebrow (italic Fraunces, very muted) — only for today
 *   2. Date headline (large Fraunces serif) — owns the space
 *   3. Stats footnote (mono metadata line) — below, not competing
 *
 * Date navigation lives to the right of the headline at baseline alignment,
 * quiet enough to be functional without competing with the typographic anchor.
 */
const PageHeader = ({ date, onDateChange, stats }) => {
  const theme  = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const handlePrev = () => {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    onDateChange(prev);
  };

  const handleNext = () => {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    onDateChange(next);
  };

  const handleToday = () => onDateChange(new Date());

  const isTodayDate     = isToday(date);
  const isYesterdayDate = isYesterday(date);
  const isTomorrowDate  = isTomorrow(date);

  // Greeting — only for today
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5)  return 'Still burning midnight oil';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'A late session';
  };

  // Contextual relative label for non-today dates
  const getRelativeLabel = () => {
    if (isYesterdayDate) return 'Yesterday';
    if (isTomorrowDate)  return 'Tomorrow';
    return null;
  };

  const relativeLabel = getRelativeLabel();

  // Color tokens
  const eyebrowColor  = isDark ? 'rgba(255,245,220,0.28)' : colors.ink[300];
  const headlineColor = theme.palette.text.primary;
  const metaColor     = isDark ? 'rgba(255,245,220,0.24)' : colors.ink[300];
  const navIconColor  = isDark ? 'rgba(255,245,220,0.3)'  : colors.ink[400];
  const navIconHover  = isDark ? 'rgba(255,245,220,0.6)'  : colors.ink[600];

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 0.5 },
        pt: { xs: 2.5, sm: 3.5 },
        pb: 1,
      }}
    >
      {/* Eyebrow — greeting today, relative label other days */}
      {(isTodayDate || relativeLabel) && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <Typography
            sx={{
              fontFamily:    '"Fraunces", serif',
              fontSize:      '0.8125rem',
              fontWeight:    400,
              fontStyle:     'italic',
              color:         eyebrowColor,
              mb:            0.375,
              letterSpacing: '0.01em',
              lineHeight:    1,
            }}
          >
            {isTodayDate ? getGreeting() : relativeLabel}
          </Typography>
        </motion.div>
      )}

      {/* ─── Headline row ─────────────────────────────────────── */}
      <Box
        sx={{
          display:        'flex',
          alignItems:     'baseline',
          justifyContent: 'space-between',
          gap:            1,
        }}
      >
        {/* Date headline */}
        <motion.div
          key={date.toISOString().split('T')[0]}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ minWidth: 0 }}
        >
          <Typography
            component="h1"
            sx={{
              fontFamily:        '"Fraunces", serif',
              fontSize:          { xs: '1.875rem', sm: '2.5rem' },
              fontWeight:        500,
              letterSpacing:     '-0.03em',
              lineHeight:        1.05,
              color:             headlineColor,
              fontOpticalSizing: 'auto',
            }}
          >
            {format(date, 'EEEE')}
            <Box
              component="span"
              sx={{
                // The month+day is slightly lighter — creates typographic hierarchy within the headline
                color:       isDark ? 'rgba(255,245,220,0.55)' : colors.ink[400],
                fontWeight:  400,
                ml:          '0.2em',
                fontSize:    { xs: '1.625rem', sm: '2.125rem' },
                letterSpacing: '-0.02em',
              }}
            >
              {format(date, 'MMMM d')}
            </Box>
          </Typography>
        </motion.div>

        {/* Navigation controls — quiet, at baseline */}
        <Box
          sx={{
            display:    'flex',
            alignItems: 'center',
            gap:        0,
            flexShrink: 0,
            mt:         0.5,
          }}
        >
          <IconButton
            size="small"
            onClick={handlePrev}
            aria-label="Previous day"
            sx={{
              color:        navIconColor,
              width:        28,
              height:       28,
              '&:hover': { color: navIconHover, backgroundColor: 'transparent' },
            }}
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </IconButton>

          {/* Today chip — only visible when not on today */}
          {!isTodayDate && (
            <Box
              component="button"
              onClick={handleToday}
              sx={{
                fontFamily:      '"IBM Plex Mono", monospace',
                fontSize:        '0.5625rem',
                fontWeight:      700,
                letterSpacing:   '0.1em',
                textTransform:   'uppercase',
                color:           colors.primary[500],
                border:          `1px solid ${isDark ? `${colors.primary[700]}` : colors.primary[200]}`,
                borderRadius:    '4px',
                px:              0.75,
                py:              0.375,
                backgroundColor: 'transparent',
                cursor:          'pointer',
                transition:      'all 0.14s ease',
                lineHeight:      1.2,
                '&:hover': {
                  backgroundColor: isDark ? `${colors.primary[900]}40` : colors.primary[50],
                  borderColor:     colors.primary[400],
                },
              }}
            >
              Today
            </Box>
          )}

          <IconButton
            size="small"
            onClick={handleNext}
            aria-label="Next day"
            sx={{
              color:    navIconColor,
              width:    28,
              height:   28,
              '&:hover': { color: navIconHover, backgroundColor: 'transparent' },
            }}
          >
            <ChevronRight size={18} strokeWidth={1.75} />
          </IconButton>
        </Box>
      </Box>

      {/* ─── Stats footnote ───────────────────────────────────── */}
      {stats && stats.total > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Typography
            sx={{
              fontFamily:    '"IBM Plex Mono", monospace',
              fontSize:      '0.6875rem',
              fontWeight:    400,
              letterSpacing: '0.01em',
              color:         metaColor,
              mt:            0.625,
              lineHeight:    1,
              display:       'flex',
              alignItems:    'center',
              gap:           0.5,
            }}
          >
            <Box component="span">
              {stats.total} {stats.total === 1 ? 'task' : 'tasks'}
            </Box>
            {stats.completed > 0 && (
              <>
                <Box component="span" sx={{ opacity: 0.4 }}>·</Box>
                <Box
                  component="span"
                  sx={{ color: isDark ? `${colors.aging.fresh}cc` : colors.aging.fresh }}
                >
                  {stats.completed} done
                </Box>
              </>
            )}
            {stats.overdue > 0 && (
              <>
                <Box component="span" sx={{ opacity: 0.4 }}>·</Box>
                <Box
                  component="span"
                  sx={{ color: isDark ? `${colors.aging.warning}cc` : colors.aging.warning }}
                >
                  {stats.overdue} carried
                </Box>
              </>
            )}
          </Typography>
        </motion.div>
      )}
    </Box>
  );
};

export default PageHeader;
