import React from 'react';
import { Box } from '@mui/material';
import RelatedNotes from './RelatedNotes';

/**
 * What sits under a note, in the viewer and the editor: other notes it is
 * connected to. Each section hides itself when it has nothing, so a note with
 * no connections ends where its text ends. Not printed.
 */
function NoteFooter({ noteId }) {
    if (!noteId) return null;
    return (
        <Box data-note-footer sx={{ '@media print': { display: 'none' } }}>
            <RelatedNotes noteId={noteId} />
        </Box>
    );
}

export default NoteFooter;
