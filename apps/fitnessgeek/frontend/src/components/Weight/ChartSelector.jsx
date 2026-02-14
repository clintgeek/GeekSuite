import React from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  ShowChart,
  Timeline
} from '@mui/icons-material';

const ChartSelector = ({ view, onViewChange }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleChange = (event, newView) => {
    if (newView !== null) {
      onViewChange(newView);
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'center',
      mb: 2
    }}>
      <ToggleButtonGroup
        value={view}
        exclusive
        onChange={handleChange}
        size={isMobile ? 'small' : 'medium'}
        sx={{
          backgroundColor: theme.palette.background.paper,
          borderRadius: 2,
          boxShadow: theme.shadows[1]
        }}
      >
        <ToggleButton
          value="sparkline"
          sx={{
            px: isMobile ? 1.5 : 2,
            py: isMobile ? 0.5 : 1,
            fontSize: isMobile ? '0.75rem' : '0.875rem'
          }}
        >
          <Timeline sx={{ fontSize: isMobile ? '1rem' : '1.25rem', mr: 0.5 }} />
          Compact
        </ToggleButton>
        <ToggleButton
          value="full"
          sx={{
            px: isMobile ? 1.5 : 2,
            py: isMobile ? 0.5 : 1,
            fontSize: isMobile ? '0.75rem' : '0.875rem'
          }}
        >
          <ShowChart sx={{ fontSize: isMobile ? '1rem' : '1.25rem', mr: 0.5 }} />
          Detailed
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};

export default ChartSelector;