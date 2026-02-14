import React from 'react';
import {
  Box,
  Alert,
  CircularProgress
} from '@mui/material';

const WeightLayout = ({
  loading,
  successMessage,
  errorMessage,
  onClearSuccess,
  onClearError,
  children
}) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      pb: 8 // Extra bottom padding for FAB
    }}>
      {/* Success/Error Messages */}
      {successMessage && (
        <Alert severity="success" sx={{ m: 2 }} onClose={onClearSuccess}>
          {successMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert severity="error" sx={{ m: 2 }} onClose={onClearError}>
          {errorMessage}
        </Alert>
      )}

      {/* Content */}
      <Box sx={{ px: { xs: 1, sm: 2 } }}>
        {children}
      </Box>
    </Box>
  );
};

export default WeightLayout;