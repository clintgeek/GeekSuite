import { Box, Typography, Button, useTheme } from '@mui/material';
import { colors } from '../../theme/colors';

const EmptyState = ({ title, description, action }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        py: { xs: 4, sm: 5 },
        px: { xs: 2, sm: 2.5 },
      }}
    >
      <Typography
        sx={{
          fontFamily: '"Fraunces", serif',
          fontSize: '1.125rem',
          fontWeight: 400,
          fontStyle: 'italic',
          color: theme.palette.text.disabled,
          mb: 0.5,
        }}
      >
        {title}
      </Typography>
      {description && (
        <Typography
          variant="body2"
          sx={{
            color: isDark ? 'rgba(255,255,255,0.25)' : colors.ink[300],
            maxWidth: 360,
            mb: action ? 3 : 0,
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
