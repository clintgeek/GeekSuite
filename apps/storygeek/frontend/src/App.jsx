import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CircularProgress, Box } from '@mui/material';
import { ApolloProvider } from '@apollo/client';
import apolloClient from './apolloClient';

import Layout from './components/Layout';
import StoryCreation from './pages/StoryCreation';
import StoryPlay from './pages/StoryPlay';
import StoryList from './pages/StoryList';
import CharacterSheet from './pages/CharacterSheet';
import Settings from './pages/Settings';
import LoginPage from './pages/LoginPage';

import useSharedAuthStore from './store/sharedAuthStore';
import { lightTheme, darkTheme } from './theme/theme';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { hydrateUser, isAuthenticated, isLoading } = useSharedAuthStore();
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('storyGeek-theme');
    if (savedTheme === 'dark') setIsDarkMode(true);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await hydrateUser();
      } catch {
        // Auth hydration failed
      } finally {
        setIsHydrating(false);
      }
    };
    initAuth();
  }, [hydrateUser]);

  const handleThemeToggle = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem('storyGeek-theme', newTheme ? 'dark' : 'light');
  };

  const currentTheme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ApolloProvider client={apolloClient}>
      <ThemeProvider theme={currentTheme}>
        <CssBaseline />
        <Router>
          {isHydrating ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
              <CircularProgress />
            </Box>
          ) : (
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={
                isAuthenticated ? (
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <StoryList />
                  </Layout>
                ) : <Navigate to="/login" replace />
              } />
              <Route path="/create" element={
                isAuthenticated ? (
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <StoryCreation />
                  </Layout>
                ) : <Navigate to="/login" replace />
              } />
              <Route path="/play/:storyId" element={
                isAuthenticated ? (
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <StoryPlay />
                  </Layout>
                ) : <Navigate to="/login" replace />
              } />
              <Route path="/characters/:storyId" element={
                isAuthenticated ? (
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <CharacterSheet />
                  </Layout>
                ) : <Navigate to="/login" replace />
              } />
              <Route path="/settings" element={
                isAuthenticated ? (
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <Settings />
                  </Layout>
                ) : <Navigate to="/login" replace />
              } />
              <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
            </Routes>
          )}
        </Router>
      </ThemeProvider>
    </ApolloProvider>
  );
}

export default App;
