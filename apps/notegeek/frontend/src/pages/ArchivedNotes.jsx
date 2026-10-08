import React from 'react';
import { Box, Divider, Skeleton, Typography, useTheme } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import { useQuery } from '@apollo/client';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import NoteRow from '../components/notes/NoteRow';
import { ARCHIVED_NOTES } from '../graphql/archive';
import { layout } from '../theme/tokens';
import { useNoteSelection, rowSelectProps } from '../hooks/useNoteSelection';
import { SelectButton, SelectingHeader } from '../components/select/SelectControl';
import SelectionBar from '../components/select/SelectionBar';

/**
 * Archived (`/archived`, DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U7): the notes
 * that left every list, tag and search, newest archived first. A row opens
 * the note (with its "Archived · Restore" banner); select mode restores
 * several at once. Reached from the Tags panel (the sidebar on desktop, the
 * Notes page's Tags sheet on a phone) — a secondary place, not a tab.
 */
export default function ArchivedNotes() {
  const theme = useTheme();
  const selection = useNoteSelection();
  const { data, loading, error, refetch } = useQuery(ARCHIVED_NOTES, {
    variables: { limit: 200 },
    fetchPolicy: 'cache-and-network',
  });
  const notes = data?.archivedNotes || [];

  return (
    <Box sx={{ py: { xs: '8px', sm: '16px' }, px: { xs: '8px', sm: 0 }, maxWidth: layout.contentWidth, mx: 'auto' }}>
      {selection.active ? <SelectingHeader selection={selection} /> : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', px: '4px', mb: '4px', minHeight: 44 }}>
          <Typography component="h1" variant="h6" sx={{ color: 'text.primary', m: 0, mr: 'auto' }}>
            Archived
            {notes.length > 0 ? (
              <Typography component="span" variant="h6" sx={{ color: 'text.secondary', ml: '8px' }}>
                {notes.length}
              </Typography>
            ) : null}
          </Typography>
          {notes.length > 0 && <SelectButton selection={selection} />}
        </Box>
      )}

      {loading && !data ? (
        <Box sx={{ py: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={layout.rowHeight} sx={{ borderRadius: 1, mb: 0.5 }} variant="rounded" />
          ))}
        </Box>
      ) : error && !data ? (
        <GeekErrorState error={error} onRetry={() => refetch()} />
      ) : notes.length === 0 ? (
        <GeekEmptyState
          icon={<ArchiveOutlined sx={{ fontSize: 28 }} />}
          title="Nothing archived"
          description="Archive a note to take it out of your lists, tags and search without deleting it. It keeps its history, and you can restore it from here any time."
        />
      ) : (
        <>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.5, px: '8px', mb: '8px' }}>
            Out of your lists, tags and search. Open one to read it, or select some to restore.
          </Typography>
          <Box component="section" aria-label="Archived notes">
            {notes.map((note, idx) => (
              <React.Fragment key={note.id}>
                {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
                <NoteRow note={note} dateField="archivedAt" {...rowSelectProps(selection, note)} />
              </React.Fragment>
            ))}
          </Box>
        </>
      )}

      <SelectionBar selection={selection} archivedView />
    </Box>
  );
}
