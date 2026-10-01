import React from 'react';
import { Box } from '@mui/material';
import LinkedFrom from './LinkedFrom';
import RelatedNotes from './RelatedNotes';

/**
 * What sits under a note, in the viewer and the editor: other notes it is
 * connected to — first the ones that link here ("Linked from", explicit),
 * then the ones that read like it ("Related notes", by meaning). Each
 * section hides itself when it has nothing, so a note with no connections
 * ends where its text ends. Not printed.
 */
function NoteFooter({ noteId }) {
    if (!noteId) return null;
    return (
        <Box data-note-footer sx={{ '@media print': { display: 'none' } }}>
            <LinkedFrom noteId={noteId} />
            <RelatedNotes noteId={noteId} />
        </Box>
    );
}

export default NoteFooter;
