import { Box, Typography, useTheme } from '@mui/material';
import { motion } from 'framer-motion';
import { colors } from '../../theme/colors';

/**
 * ReviewProgress — shows "N of M reviewed" with a thin animated bar.
 * Uses IBM Plex Mono tabular-nums for the count, Fraunces italic for
 * the "all caught up" congratulatory state.
 */
const ReviewProgress = ({ total, reviewed }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const allDone = reviewed >= total;
  const progress = total > 0 ? (reviewed / total) * 100 : 0;

  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[500];

  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        sx={{
          fontFamily: allDone ? '"Fraunces", serif' : '"IBM Plex Mono", monospace',
          fontStyle: allDone ? 'italic' : 'normal',
          fontVariantNumeric: allDone ? 'normal' : 'tabular-nums',
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: allDone ? colors.aging.fresh : mutedInk,
          mb: 0.75,
          letterSpacing: allDone ? '0.005em' : '0.04em',
          transition: 'color 280ms ease',
        }}
      >
        {allDone ? 'All caught up — well done.' : `${reviewed} of ${total} reviewed`}
      </Typography>

      {/* Animated progress bar — thin like a planner rule */}
      <Box
        sx={{
          height: 3,
          borderRadius: 2,
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.ink[100],
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <motion.div
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: '100%',
            backgroundColor: allDone ? colors.aging.fresh : colors.primary[500],
            borderRadius: 2,
            transition: 'background-color 280ms ease',
          }}
        />
      </Box>
    </Box>
  );
};

export default ReviewProgress;
