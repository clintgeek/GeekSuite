import React from 'react';
import { useParams, useMatch, useNavigate } from 'react-router-dom';
import { CircularProgress, Box, Button, Typography } from '@mui/material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import useAuthStore from '../store/authStore';
import NoteViewer from '../components/NoteViewer';
import NoteEditorPage from './NoteEditorPage';
import { useQuery } from '@apollo/client';
import { GET_NOTE_BY_ID } from '../graphql/queries';

function NotePage() {
    const { id } = useParams();
    const isEditRoute = useMatch('/notes/:id/edit');
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthStore();

    const isNewNote = id === 'new';

    const { data, loading: isLoadingSelected, error: queryError, refetch } = useQuery(GET_NOTE_BY_ID, {
        variables: { id },
        skip: isNewNote || id === 'undefined' || !isAuthenticated,
        fetchPolicy: 'cache-and-network',
    });

    const noteToDisplay = data?.note;

    // Keyed by the note: going from one note straight to another
    // (/notes/a -> /notes/b — a [[link]], Related notes, or the list beside
    // the note in two-pane) must be a NEW editor. Without the key React kept
    // the same NoteEditorPage: a's unmount flush (save + device draft) never
    // ran, and its unsaved edits were left to a form that then re-seeded
    // itself for b. A new key unmounts a (flush) and mounts b fresh, as the
    // edit route (NoteEditorRoute) already does.
    const editorKey = `note:${id}`;
    const renderEditor = () => <NoteEditorPage key={editorKey} />;

    // For new notes, show the editor
    if (isNewNote) {
        return renderEditor();
    }

    // Check for authentication first
    if (!isAuthenticated) {
        return (
            <Box sx={{ maxWidth: 500, mx: 'auto', py: 8 }}>
                <GeekEmptyState
                    title="Sign in required"
                    description="You need to be logged in to view this note."
                    action={
                        <Button variant="outlined" onClick={() => navigate('/login')}>
                            Login
                        </Button>
                    }
                />
            </Box>
        );
    }

    // A spinner only when there is nothing to show (3.1). `cache-and-network`
    // keeps `loading` true while it re-checks a note it already has, and this
    // used to hide the cached note behind a spinner on every open — and
    // forever, offline.
    if (isLoadingSelected && !noteToDisplay) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '300px',
                    gap: 2,
                }}
            >
                <CircularProgress size={32} />
                <Typography variant="body2" color="text.secondary">
                    Loading note...
                </Typography>
            </Box>
        );
    }

    // An error only matters when there is no copy to show (3.1): offline, the
    // cached note is still the note.
    if (queryError && !noteToDisplay) {
        return (
            <Box sx={{ maxWidth: 500, mx: 'auto', py: 8 }}>
                <GeekErrorState
                    error={queryError}
                    description="Could not load note."
                    onRetry={() => refetch()}
                    action={
                        <Button variant="text" onClick={() => navigate('/')}>
                            Back to Notes
                        </Button>
                    }
                />
            </Box>
        );
    }

    // Show empty state if note not found or id is 'undefined'
    if (!isLoadingSelected && !noteToDisplay && !isNewNote || id === 'undefined') {
        return (
            <Box sx={{ maxWidth: 500, mx: 'auto', py: 8 }}>
                <GeekEmptyState
                    title="Note not found or may have been deleted."
                    action={
                        <Button variant="outlined" onClick={() => navigate('/')}>
                            Back to Notes
                        </Button>
                    }
                />
            </Box>
        );
    }

    // Handwritten notes always show the editor (even in view mode): they are
    // inherently interactive.
    if (noteToDisplay && noteToDisplay.type === 'handwritten') {
        return renderEditor();
    }

    // For Markdown notes, use the regular viewer/editor pattern. The
    // frame does not scroll on /notes/:id (Layout passes `fill` so the
    // editor can own its height), so the viewer brings its own scroller.
    return isEditRoute ? <NoteEditorPage key={editorKey} /> : (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <NoteViewer />
        </Box>
    );
}

export default NotePage;