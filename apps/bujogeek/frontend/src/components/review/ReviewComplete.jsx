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
      {/* Calligraphic pen stroke — draws itself like a signature */}
      <svg
        width="160"
        height="44"
        viewBox="0 0 160 44"
        style={{ marginBottom: 22, overflow: 'visible' }}
      >
        <motion.path
          d="M 10,35 C 28,10 58,42 82,26 C 106,10 130,36 150,18"
          fill="none"
          stroke={fresh}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
        />
        {/* Terminal dot — pen lifts from the page */}
        <motion.circle
          cx="150"
          cy="18"
          r="2.25"
          fill={fresh}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 1.4 }}
        />
      </svg>

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
        onClick={() => navigate('/')}
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
