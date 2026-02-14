import { Box, Container } from '@mui/material';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import TasksPage from '../pages/TasksPage';
import TemplatesPage from '../pages/TemplatesPage';
import QuickEntry from './tasks/QuickEntry';
import ProtectedRoute from './ProtectedRoute';
import { useState, useEffect } from 'react';

const MainContent = () => {
  const { user } = useAuth();
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);

  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyPress = (event) => {
      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        setQuickEntryOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyPress, true);
    return () => window.removeEventListener('keydown', handleKeyPress, true);
  }, []);

  return (
    <Box sx={{
      minHeight: '100%',
      bgcolor: 'background.default',
    }}>
      <Container
        maxWidth="lg"
        sx={{
          flexGrow: 1,
          py: { xs: 2, sm: 3 },
          px: { xs: 1, sm: 2 },
        }}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<Navigate to={user ? '/tasks/daily' : '/login'} replace />} />
          <Route path="/tasks/*" element={
            <ProtectedRoute>
              <TasksPage />
            </ProtectedRoute>
          } />
          <Route path="/templates/*" element={
            <ProtectedRoute>
              <TemplatesPage />
            </ProtectedRoute>
          } />
        </Routes>
      </Container>

      {user && <QuickEntry open={quickEntryOpen} onClose={() => setQuickEntryOpen(false)} />}
    </Box>
  );
};

export default MainContent;