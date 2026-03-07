import React, { useEffect } from 'react';
import { useParams, useMatch, useNavigate } from 'react-router-dom';
import { CircularProgress, Alert, Box, Button, Typography } from '@mui/material';
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

    const { data, loading: isLoadingSelected, error: queryError } = useQuery(GET_NOTE_BY_ID, {
        variables: { id },
        skip: isNewNote || id === 'undefined' || !isAuthenticated,
        fetchPolicy: 'cache-and-network',
    });

    const noteToDisplay = data?.note;
    const selectedError = queryError?.message;

    // Add or remove 'mindmap-view' class from body when viewing mind maps
    useEffect(() => {
        const isMindMap = noteToDisplay?.type === 'mindmap';

        if (isMindMap) {
            document.body.classList.add('mindmap-view');
        } else {
            document.body.classList.remove('mindmap-view');
        }

        return () => {
            document.body.classList.remove('mindmap-view');
        };
    }, [noteToDisplay?.type]);

    // Helper to render the note editor
    // Mind maps need full-height layout; handwritten uses position:fixed so no special wrapper needed
    const renderEditor = () => {
        if (noteToDisplay?.type === 'mindmap') {
            return (
                <Box sx={{
                    display: 'flex',
                    flexGrow: 1,
                    height: 'calc(100vh - 100px)',
                    width: '100%',
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    <Box component="main" sx={{
                        flexGrow: 1,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <NoteEditorPage />
                    </Box>
                </Box>
            );
        }

        // Standard editor for all other types (including handwritten, which handles its own layout)
        return <NoteEditorPage />;
    };

    // For new notes, show the editor
    if (isNewNote) {
        return renderEditor();
    }

    // Check for authentication first
    if (!isAuthenticated) {
        return (
            <Box sx={{ maxWidth: 500, mx: 'auto', py: 8 }}>
                <Alert
                    severity="error"
                    sx={{ borderRadius: 3 }}
                    action={
                        <Button color="inherit" size="small" onClick={() => navigate('/login')}>
                            Login
                        </Button>
                    }
                >
                    You need to be logged in to view this note.
                </Alert>
            </Box>
        );
    }

    // Show loading indicator while fetching
    if (isLoadingSelected) {
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

    // Show error if note couldn't be loaded
    if (selectedError) {
        return (
            <Box sx={{ maxWidth: 500, mx: 'auto', py: 8 }}>
                <Alert
                    severity="error"
                    sx={{ borderRadius: 3 }}
                    action={
                        <Button color="inherit" size="small" onClick={() => navigate('/')}>
                            Back to Notes
                        </Button>
                    }
                >
                    {selectedError || 'Could not load note.'}
                </Alert>
            </Box>
        );
    }

    // Show warning if note not found or id is 'undefined'
    if (!isLoadingSelected && !noteToDisplay && !isNewNote || id === 'undefined') {
        return (
            <Box sx={{ maxWidth: 500, mx: 'auto', py: 8 }}>
                <Alert
                    severity="warning"
                    sx={{ borderRadius: 3 }}
                    action={
                        <Button color="inherit" size="small" onClick={() => navigate('/')}>
                            Back to Notes
                        </Button>
                    }
                >
                    Note not found or may have been deleted.
                </Alert>
            </Box>
        );
    }

    // For mind maps/handwritten, always show the editor (even in view mode)
    // These are inherently interactive
    if (noteToDisplay && (noteToDisplay.type === 'mindmap' || noteToDisplay.type === 'handwritten')) {
        return renderEditor();
    }

    // For other note types, use the regular viewer/editor pattern
    return isEditRoute ? <NoteEditorPage /> : <NoteViewer />;
}

export default NotePage;