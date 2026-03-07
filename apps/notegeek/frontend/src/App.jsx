import React, { useEffect, useState } from 'react';
// Use `useParams` for route parameters
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import Layout from './components/Layout';
import AppErrorBoundary from './components/AppErrorBoundary';
import useAuthStore from './store/authStore';
import useNoteStore from './store/noteStore';
import './App.css';

// Import actual page components
import Login from './components/Login';
import Register from './components/Register';

// Import main app components
import NoteList from './components/NoteList';
import NoteEditorPage from './pages/NoteEditorPage';
import NotePage from './pages/NotePage';
import SearchResults from './components/SearchResults';
import TagNotesList from './components/TagNotesList';
import QuickCaptureHome from './pages/QuickCaptureHome';
import Settings from './pages/Settings';

// NewNoteWrapper component to clear state before showing editor
function NewNoteWrapper() {
    const { clearSelectedNote } = useNoteStore();
    const [key, setKey] = useState(0);

    // Clear any selected note when mounting this component
    useEffect(() => {
        clearSelectedNote();
        // Force a remount of NoteEditorPage by changing its key
        setKey(prev => prev + 1);
    }, [clearSelectedNote]);

    return <NoteEditorPage key={key} />;
}

// Main App Component
function App() {
    const { hydrateUser, isAuthenticated } = useAuthStore();
    const [isHydrating, setIsHydrating] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                setIsHydrating(true);
                await hydrateUser();
            } catch {
                // Auth hydration failed silently - user will be redirected to login
            } finally {
                setIsHydrating(false);
            }
        };

        initAuth();
    }, [hydrateUser]);

    return (
        <AppErrorBoundary>
            <Router>
                {isHydrating ? (
                    <Box
                        display="flex"
                        justifyContent="center"
                        alignItems="center"
                        minHeight="100vh"
                    >
                        <CircularProgress />
                    </Box>
                ) : (
                    <Routes>
                        {/* Public routes */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />

                        {/* Protected routes */}
                        <Route
                            path="/"
                            element={
                                isAuthenticated ? (
                                    <Layout>
                                        <QuickCaptureHome />
                                    </Layout>
                                ) : (
                                    <Navigate to="/login" replace />
                                )
                            }
                        />

                        {/* Add other protected routes here */}
                        {isAuthenticated && (
                            <>
                                <Route path="/notes/new" element={<Layout><NewNoteWrapper /></Layout>} />
                                <Route path="/notes/undefined" element={<Navigate to="/" replace />} />
                                <Route path="/notes/undefined/edit" element={<Navigate to="/" replace />} />
                                <Route path="/notes" element={<Layout><NoteList /></Layout>} />
                                <Route path="/notes/:id" element={<Layout><NotePage /></Layout>} />
                                <Route path="/notes/:id/edit" element={<Layout><NoteEditorPage /></Layout>} />
                                <Route path="/tags/:tag" element={<Layout><TagNotesList /></Layout>} />
                                <Route path="/search" element={<Layout><SearchResults /></Layout>} />
                                <Route path="/settings" element={<Layout><Settings /></Layout>} />
                            </>
                        )}

                        {/* Catch-all route to prevent blank page freeze when unauthorized */}
                        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
                    </Routes>
                )}
            </Router>
        </AppErrorBoundary>
    );
}

export default App;
