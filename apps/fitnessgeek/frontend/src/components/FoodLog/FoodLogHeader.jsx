import React from 'react';
import {
  Box,
  Typography
} from '@mui/material';

const FoodLogHeader = ({
  ...props
}) => {
  return (
    <Box sx={{
      p: { xs: 1, sm: 2 },
      pb: { xs: 0.5, sm: 1 },
      ...props.sx
    }}
      {...props}
    >
      {/* Removed date display - DateNavigator handles this */}
    </Box>
  );
};

export default FoodLogHeader;