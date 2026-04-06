import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from 'react-query';

// Components
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import SharedAuthProvider from './components/SharedAuthProvider';
import StoryCreation from './pages/StoryCreation';
import StoryPlay from './pages/StoryPlay';
import StoryList from './pages/StoryList';
import CharacterSheet from './pages/CharacterSheet';
import Settings from './pages/Settings';
import LoginPage from './pages/LoginPage';

// Theme
import { lightTheme, darkTheme } from './theme/theme';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Get theme from localStorage or default to light
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('storyGeek-theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
    }
  }, []);

  const handleThemeToggle = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem('storyGeek-theme', newTheme ? 'dark' : 'light');
  };

  const currentTheme = isDarkMode ? darkTheme : lightTheme;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={currentTheme}>
        <CssBaseline />
        <Router>
          <SharedAuthProvider app="storygeek">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={
                <RequireAuth>
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <StoryList />
                  </Layout>
                </RequireAuth>
              } />
              <Route path="/create" element={
                <RequireAuth>
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <StoryCreation />
                  </Layout>
                </RequireAuth>
              } />
              <Route path="/play/:storyId" element={
                <RequireAuth>
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <StoryPlay />
                  </Layout>
                </RequireAuth>
              } />
              <Route path="/characters/:storyId" element={
                <RequireAuth>
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <CharacterSheet />
                  </Layout>
                </RequireAuth>
              } />
              <Route path="/settings" element={
                <RequireAuth>
                  <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>
                    <Settings />
                  </Layout>
                </RequireAuth>
              } />
            </Routes>
          </SharedAuthProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;