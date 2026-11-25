import React, { useEffect, useState } from 'react';
// Use `useParams` for route parameters
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import Layout from './components/Layout';
import AppErrorBoundary from './components/AppErrorBoundary';
import useAuthStore from './store/authStore';
import './App.css';

// Import actual page components
import Login from './components/Login';
import Register from './components/Register';

// Import main app components
import KindNotesList from './components/KindNotesList';
import NoteEditorRoute from './pages/NoteEditorRoute';
import DeletedNotes from './pages/DeletedNotes';
import PhotoPagesPage from './pages/PhotoPagesPage';
import NotePage from './pages/NotePage';
import SearchResults from './components/SearchResults';
import TagNotesList from './components/TagNotesList';
import QuickCaptureHome from './pages/QuickCaptureHome';
import Settings from './pages/Settings';
import PenLab from './pages/PenLab';
import ShareTarget from './pages/ShareTarget';
import ArchivedNotes from './pages/ArchivedNotes';

// `/login` and `/register` accept an optional same-origin `?redirect=` (or
// `?returnTo=`) target — honored only when it's a relative path, so an
// already-authenticated visit bounces back to where it came from instead of
// always landing on `/`.
function getSafeReturnTo() {
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('redirect') || params.get('returnTo');
        if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
    } catch {
        // ignore malformed query strings
    }
    return '/';
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
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            minHeight: '100vh',
                            // `dvh` tracks the visible viewport on mobile Safari,
                            // where `100vh` is the largest viewport and clips
                            // behind the URL bar (same pattern as GeekShell.jsx).
                            '@supports (height: 100dvh)': { minHeight: '100dvh' },
                        }}
                    >
                        <CircularProgress />
                    </Box>
                ) : (
                    <Routes>
                        {/* Public routes — already-authenticated visits redirect home
                            (or to `?redirect=`) instead of showing the splash/form. */}
                        <Route path="/login" element={isAuthenticated ? <Navigate to={getSafeReturnTo()} replace /> : <Login />} />
                        <Route path="/register" element={isAuthenticated ? <Navigate to={getSafeReturnTo()} replace /> : <Register />} />

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

                        {/* Android share target ("Share -> NoteGeek", manifest share_target,
                            GET method). Reachable whether or not the visitor is logged in — an
                            expired/absent session must not drop the shared title/text/url, so
                            this route (unlike the block below) sends a logged-out visitor
                            through /login with this same query string via ?redirect=, rather
                            than falling through to the catch-all's bare /login. */}
                        <Route
                            path="/share"
                            element={
                                isAuthenticated ? (
                                    <Layout><ShareTarget /></Layout>
                                ) : (
                                    <Navigate to={`/login?redirect=${encodeURIComponent('/share' + window.location.search)}`} replace />
                                )
                            }
                        />

                        {/* Add other protected routes here */}
                        {isAuthenticated && (
                            <>
                                <Route path="/notes/new" element={<Layout><NoteEditorRoute /></Layout>} />
                                {/* Photo of a page (DOCS/HANDWRITING.md §3). A static segment, so it
                                    outranks /notes/:id. */}
                                <Route path="/notes/photo" element={<Layout><PhotoPagesPage /></Layout>} />
                                <Route path="/notes/undefined" element={<Navigate to="/" replace />} />
                                <Route path="/notes/undefined/edit" element={<Navigate to="/" replace />} />
                                {/* The notes list, partitioned (DOCS/NOTE_KINDS_SPEC.md). */}
                                <Route path="/notes" element={<Layout><KindNotesList kind="notes" /></Layout>} />
                                <Route path="/dailies" element={<Layout><KindNotesList kind="dailies" /></Layout>} />
                                <Route path="/meetings" element={<Layout><KindNotesList kind="meetings" /></Layout>} />
                                <Route path="/everything" element={<Layout><KindNotesList kind="everything" /></Layout>} />
                                <Route path="/notes/:id" element={<Layout><NotePage /></Layout>} />
                                <Route path="/notes/:id/edit" element={<Layout><NoteEditorRoute /></Layout>} />
                                <Route path="/tags/:tag" element={<Layout><TagNotesList /></Layout>} />
                                <Route path="/search" element={<Layout><SearchResults /></Layout>} />
                                <Route path="/archived" element={<Layout><ArchivedNotes /></Layout>} />
                                <Route path="/deleted" element={<Layout><DeletedNotes /></Layout>} />
                                <Route path="/settings" element={<Layout><Settings /></Layout>} />
                                {/* A diagnostic, not linked from anywhere (pages/PenLab.jsx). */}
                                <Route path="/labs/pen" element={<Layout><PenLab /></Layout>} />
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
