import React, { useEffect } from 'react';
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
                // `height: '100%'` rather than a viewport-relative magic
                // number: this Box sits inside GeekAppFrame's route
                // transition, which resolves a real height off the shell's
                // own 100dvh chain (same pattern NoteEditorPage's root
                // relies on), so it fills exactly what the shell gives it.
                <Box sx={{
                    display: 'flex',
                    flexGrow: 1,
                    height: '100%',
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
    if (queryError) {
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

    // For mind maps/handwritten, always show the editor (even in view mode)
    // These are inherently interactive
    if (noteToDisplay && (noteToDisplay.type === 'mindmap' || noteToDisplay.type === 'handwritten')) {
        return renderEditor();
    }

    // For other note types, use the regular viewer/editor pattern
    return isEditRoute ? <NoteEditorPage /> : <NoteViewer />;
}

export default NotePage;