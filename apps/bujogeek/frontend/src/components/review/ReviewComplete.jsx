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
      {/* Fountain pen nib + bilateral calligraphic flourishes */}
      <svg
        width="200"
        height="64"
        viewBox="0 0 200 64"
        style={{ marginBottom: 24, overflow: 'visible' }}
      >
        {/* Pen nib — diamond/nib shape, appears before flourishes draw */}
        <motion.g
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: '100px 20px' }}
        >
          {/* Nib body — tapered diamond pointing down */}
          <path
            d="M 100,4 L 89,20 L 100,29 L 111,20 Z"
            fill={fresh}
            fillOpacity={0.9}
          />
          {/* Center slit — ink channel */}
          <line
            x1="100" y1="9"
            x2="100" y2="27"
            stroke={isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.65)'}
            strokeWidth="1"
            strokeLinecap="round"
          />
        </motion.g>

        {/* Ink droplet at nib tip — appears just before flourishes */}
        <motion.circle
          cx="100"
          cy="30"
          r="2.5"
          fill={fresh}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: '100px 30px' }}
        />

        {/* Left flourish — draws outward from nib tip */}
        <motion.path
          d="M 97,30 C 80,36 56,48 30,42 C 16,38 6,31 3,35 C 0,38 3,45 11,47 C 26,51 66,42 95,38"
          fill="none"
          stroke={fresh}
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.9 }}
          transition={{ duration: 1.05, ease: 'easeInOut', delay: 0.35 }}
        />

        {/* Right flourish — mirror of left */}
        <motion.path
          d="M 103,30 C 120,36 144,48 170,42 C 184,38 194,31 197,35 C 200,38 197,45 189,47 C 174,51 134,42 105,38"
          fill="none"
          stroke={fresh}
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.9 }}
          transition={{ duration: 1.05, ease: 'easeInOut', delay: 0.55 }}
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
