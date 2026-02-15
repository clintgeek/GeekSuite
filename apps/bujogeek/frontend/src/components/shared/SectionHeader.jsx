import { Box, Typography, IconButton, useTheme } from '@mui/material';
import { colors } from '../../theme/colors';

const SectionHeader = ({ title, count, action }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        mt: 3,
        mb: 1.5,
        px: 0.5,
      }}
    >
      <Typography
        variant="h6"
        sx={{
          color: theme.palette.text.secondary,
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}
      >
        {title}
        {count !== undefined && count !== null && (
          <Box
            component="span"
            sx={{ ml: 0.75, fontWeight: 400, color: theme.palette.text.disabled }}
          >
            ({count})
          </Box>
        )}
      </Typography>
      <Box
        sx={{
          flex: 1,
          height: '1px',
          backgroundColor: theme.palette.divider,
        }}
      />
      {action && (
        <Box sx={{ flexShrink: 0 }}>
          {action}
        </Box>
      )}
    </Box>
  );
};

export default SectionHeader;
