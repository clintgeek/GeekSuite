import React, { useState } from 'react';
import { Box, Button, Divider, Skeleton, Typography, useTheme } from '@mui/material';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useMutation, useQuery } from '@apollo/client';
import { GeekDialog, GeekEmptyState, GeekErrorState, useToast } from '@geeksuite/ui';
import TypeIcon from '../components/notes/TypeIcon';
import { DELETED_NOTES } from '../graphql/queries';
import { RESTORE_NOTE, PURGE_NOTE } from '../graphql/mutations';
import { onNoteRestored } from '../graphql/cacheUpdates';
import { formatRelativeTime } from '../utils/dateUtils';
import { layout } from '../theme/tokens';
import useNoteStore from '../store/noteStore';
import { useListWidth } from '../components/notes/ListColumn';

/**
 * Recently deleted (`/deleted`; contract C4, decision D1, review 2026-11 1.19).
 *
 * A deleted note waits here for 30 days with its history, then the server
 * purges it. Restore puts it back everywhere it was; Delete forever is the
 * only irreversible act in the app, so it asks first — with Cancel focused.
 * Reached from the Tags panel (beside Archived) and from Settings.
 */
export default function DeletedNotes() {
  const theme = useTheme();
  const listWidth = useListWidth();
  const { notify } = useToast();
  const [confirm, setConfirm] = useState(null);
  const { data, loading, error, refetch } = useQuery(DELETED_NOTES, { variables: { limit: 200 }, fetchPolicy: 'cache-and-network' });
  const [restoreMutation, { loading: restoring }] = useMutation(RESTORE_NOTE, { update: onNoteRestored });
  const [purgeMutation, { loading: purging }] = useMutation(PURGE_NOTE);
  const notes = data?.deletedNotes || [];

  const restore = async (note) => {
    try {
      await restoreMutation({ variables: { id: note.id } });
      useNoteStore.getState().refreshLists?.();
      await refetch();
      notify('Note restored', { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'Could not restore the note.', { tone: 'error' });
    }
  };

  const purge = async (note) => {
    setConfirm(null);
    try {
      await purgeMutation({
        variables: { id: note.id },
        update: (cache) => {
          const ref = cache.identify({ __typename: 'Note', id: String(note.id) });
          if (ref) cache.evict({ id: ref });
          cache.evict({ id: 'ROOT_QUERY', fieldName: 'deletedNotes' });
          cache.gc();
        },
      });
      await refetch();
      notify('Deleted forever', { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'Could not delete the note.', { tone: 'error' });
    }
  };

  const button = { textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44, px: '12px', flexShrink: 0 };

  return (
    <Box sx={{ py: { xs: '8px', sm: '16px' }, px: { xs: '8px', sm: 0 }, maxWidth: listWidth, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', px: '4px', mb: '4px', minHeight: 44 }}>
        <Typography component="h1" variant="h6" sx={{ color: 'text.primary', m: 0, mr: 'auto' }}>
          Recently deleted
          {notes.length > 0 ? (
            <Typography component="span" variant="h6" sx={{ color: 'text.secondary', ml: '8px' }}>
              {notes.length}
            </Typography>
          ) : null}
        </Typography>
      </Box>

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
          icon={<DeleteOutline sx={{ fontSize: 28 }} />}
          title="Nothing deleted"
          description="A note you delete waits here for 30 days, with its history, before it is gone for good."
        />
      ) : (
        <>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.5, px: '8px', mb: '8px' }}>
            Deleted notes are kept for 30 days, then removed for good.
          </Typography>
          <Box component="ul" aria-label="Deleted notes" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {notes.map((note, idx) => (
              <React.Fragment key={note.id}>
                {idx > 0 && <Divider component="li" aria-hidden sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
                <Box component="li" data-deleted-row={note.id} sx={{ display: 'flex', alignItems: 'center', gap: '8px', py: '8px', px: '8px', flexWrap: 'wrap' }}>
                  <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {note.title || 'Untitled'}
                    </Typography>
                    {note.preview ? (
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {note.preview}
                      </Typography>
                    ) : null}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt: '4px', color: 'text.secondary' }}>
                      <TypeIcon type={note.type || 'text'} size={15} />
                      <Typography component="span" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                        {note.deletedAt ? `Deleted ${formatRelativeTime(note.deletedAt)}` : 'Deleted'}
                      </Typography>
                    </Box>
                  </Box>
                  {/* One group: on a phone the pair drops under the note
                      together, right-aligned. Apart, "Delete forever" stayed
                      beside the title (cutting it short) and Restore fell to
                      a line of its own. */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', ml: 'auto', flexShrink: 0 }}>
                    <Button onClick={() => setConfirm(note)} disabled={purging} color="inherit" sx={{ ...button, fontWeight: 500 }}>
                      Delete forever
                    </Button>
                    <Button onClick={() => restore(note)} disabled={restoring} variant="outlined" sx={button}>
                      Restore
                    </Button>
                  </Box>
                </Box>
              </React.Fragment>
            ))}
          </Box>
        </>
      )}

      <GeekDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        mode="window"
        title="Delete forever?"
        primaryAction={
          <Button onClick={() => purge(confirm)} variant="contained" color="error" sx={{ textTransform: 'none' }}>
            Delete forever
          </Button>
        }
        secondaryAction={
          // Focused, so Enter cancels.
          <Button onClick={() => setConfirm(null)} variant="text" color="inherit" autoFocus sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
        }
      >
        <Typography variant="body2">
          {`${confirm?.title || 'This note'} and its history will be removed for good. This cannot be undone.`}
        </Typography>
      </GeekDialog>
    </Box>
  );
}
