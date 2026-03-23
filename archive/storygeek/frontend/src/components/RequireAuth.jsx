import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore.js';
import { CircularProgress, Box } from '@mui/material';

const RequireAuth = ({ children }) => {
  const { isAuthenticated, checkAuth } = useSharedAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const verifyAuth = async () => {
      await checkAuth();
      setIsLoading(false);
    };
    verifyAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth;