import { Box, Typography, useTheme } from '@mui/material';
import { colors } from '../../theme/colors';

const EmptyState = ({ title, description, action }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        py: { xs: 5, sm: 6 },
        px: { xs: 2, sm: 2.5 },
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'flex-start',
      }}
    >
      {/* Ornament — the three-dot pause mark */}
      <Box
        aria-hidden="true"
        sx={{
          fontFamily:    '"IBM Plex Mono", monospace',
          fontSize:      '0.5rem',
          letterSpacing: '0.45em',
          color:         isDark ? 'rgba(255,245,220,0.14)' : colors.ink[300],
          mb:            1.5,
          userSelect:    'none',
          lineHeight:    1,
        }}
      >
        · · ·
      </Box>

      {/* Title — soft Fraunces italic, intentionally quiet */}
      <Typography
        sx={{
          fontFamily:        '"Fraunces", serif',
          fontSize:          { xs: '1.0625rem', sm: '1.1875rem' },
          fontWeight:        300,
          fontStyle:         'italic',
          color:             isDark ? 'rgba(255,245,220,0.32)' : colors.ink[400],
          lineHeight:        1.35,
          letterSpacing:     '-0.01em',
          fontOpticalSizing: 'auto',
          mb:                description ? 0.75 : 0,
        }}
      >
        {title}
      </Typography>

      {description && (
        <Typography
          sx={{
            fontFamily:  '"Source Sans 3", sans-serif',
            fontSize:    '0.8125rem',
            color:       isDark ? 'rgba(255,245,220,0.2)' : colors.ink[300],
            maxWidth:    380,
            lineHeight:  1.6,
            fontWeight:  400,
            mb:          action ? 3 : 0,
          }}
        >
          {description}
        </Typography>
      )}

      {action && action}
    </Box>
  );
};

export default EmptyState;
