import { Box, Typography, Button, useTheme } from '@mui/material';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../theme/colors';

/**
 * ReviewComplete — the emotional payoff. When every aging task has been
 * tended to, this is what the user sees. Should feel like closing a
 * planner at the end of a good day: calm, warm, a little ceremonial.
 *
 * Not a status screen. A moment.
 */
const ReviewComplete = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const primaryInk = theme.palette.text.primary;
  const fresh = colors.aging.fresh;

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: { xs: 8, sm: 11 },
        px: 3,
        textAlign: 'center',
      }}
    >
      {/* Hand-drawn flourish mark drawn via SVG */}
      <motion.svg
        width="80"
        height="28"
        viewBox="0 0 80 28"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 20 }}
      >
        {/* A gentle flourish — two curves meeting with a dot, like a fountain-pen checkmark */}
        <motion.path
          d="M 6 14 Q 18 22 28 10 T 52 14 Q 62 18 74 8"
          fill="none"
          stroke={fresh}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <motion.circle
          cx="74"
          cy="8"
          r="2"
          fill={fresh}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, delay: 1.1 }}
        />
      </motion.svg>

      {/* Italic eyebrow caption */}
      <Typography
        sx={{
          fontFamily: '"Fraunces", serif',
          fontStyle: 'italic',
          fontSize: '0.875rem',
          fontWeight: 400,
          color: captionInk,
          letterSpacing: '0.01em',
          mb: 1.25,
        }}
      >
        Evening, {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
      </Typography>

      {/* Display title — the real payoff */}
      <Typography
        component="h2"
        sx={{
          fontFamily: '"Fraunces", serif',
          fontSize: { xs: '2rem', sm: '2.625rem' },
          fontWeight: 500,
          color: primaryInk,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          fontOpticalSizing: 'auto',
          mb: 1.5,
        }}
      >
        All caught up.
      </Typography>

      {/* Italic subtitle — the closing blessing */}
      <Typography
        sx={{
          fontFamily: '"Fraunces", serif',
          fontStyle: 'italic',
          fontSize: { xs: '1rem', sm: '1.125rem' },
          fontWeight: 400,
          color: isDark ? 'rgba(255,255,255,0.55)' : colors.ink[500],
          maxWidth: 360,
          lineHeight: 1.55,
          letterSpacing: '0.005em',
          mb: 4,
        }}
      >
        You've tended to everything aging on the page. Close the book. Rest easy.
      </Typography>

      {/* Decorative dotted rule — bullet journal page divider */}
      <Box
        sx={{
          width: 120,
          borderTop: `1px dotted ${isDark ? 'rgba(255,255,255,0.25)' : colors.ink[300]}`,
          mb: 4,
        }}
      />

      <Button
        variant="outlined"
        onClick={() => navigate('/today')}
        sx={{
          fontFamily: '"Fraunces", serif',
          fontSize: '0.9375rem',
          fontWeight: 400,
          fontStyle: 'italic',
          textTransform: 'none',
          color: colors.primary[500],
          borderColor: colors.primary[200],
          px: 3,
          py: 1,
          '&:hover': {
            borderColor: colors.primary[500],
            backgroundColor: colors.primary[50],
            transform: 'none',
          },
        }}
      >
        Back to today
      </Button>
    </Box>
  );
};

export default ReviewComplete;
