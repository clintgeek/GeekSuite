import React from 'react';
import {
    Typography,
    Alert,
    Box,
    Skeleton,
    Divider,
    useTheme,
} from '@mui/material';
import { gql, useQuery } from '@apollo/client';
import NoteRow from './notes/NoteRow';

const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String) {
        notes(tag: $tag, prefix: $prefix) {
            id
            title
            content
            type
            tags
            createdAt
            updatedAt
        }
    }
`;


// ─── NoteList ─────────────────────────────────────────────────────────────────

function NoteList({ tag, prefix }) {
    const theme = useTheme();
    const { loading: isLoadingList, error, data } = useQuery(GET_NOTES, {
        variables: { tag, prefix },
        fetchPolicy: 'cache-and-network',
    });

    const notes = data?.notes || [];
    const listError = error?.message;

    if (isLoadingList && !data) {
        return (
            <Box sx={{ py: 2, maxWidth: 720, mx: 'auto' }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} height={44} sx={{ borderRadius: 1, mb: 0.5 }} variant="rounded" />
                ))}
            </Box>
        );
    }

    if (listError) {
        return (
            <Alert severity="error" sx={{ width: '100%', borderRadius: 2 }}>
                {listError}
            </Alert>
        );
    }

    if (notes.length === 0) {
        return (
            <Box sx={{ py: 8, textAlign: 'center', maxWidth: 720, mx: 'auto' }}>
                <Typography variant="body1" sx={{ color: 'text.disabled', mb: 0.5 }}>
                    {tag ? 'No notes tagged here yet.' : 'No notes yet'}
                </Typography>
                {!tag && (
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        Create your first note to get started
                    </Typography>
                )}
            </Box>
        );
    }

    const sortedNotes = [...notes].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt);
        const dateB = new Date(b.updatedAt || b.createdAt);
        return dateB - dateA;
    });

    return (
        <Box sx={{ py: { xs: 1, sm: 1.5 }, maxWidth: 720, mx: 'auto' }}>
            {/* Count label */}
            <Box sx={{ mb: 1.5, px: 0.5 }}>
                <Typography variant="h6" sx={{ color: 'text.disabled' }}>
                    {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </Typography>
            </Box>

            {/* Editorial list */}
            <Box>
                {sortedNotes.map((note, idx) => (
                    <React.Fragment key={note.id || note._id}>
                        {idx > 0 && (
                            <Divider sx={{ borderColor: theme.palette.divider }} />
                        )}
                        <NoteRow note={note} />
                    </React.Fragment>
                ))}
            </Box>
        </Box>
    );
}

export default NoteList;
