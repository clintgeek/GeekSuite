import React, { useRef, useState } from 'react';
import { Box, Button, Divider, Skeleton, Typography, useTheme } from '@mui/material';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { GeekDialog, GeekEmptyState, GeekErrorState, useToast } from '@geeksuite/ui';
import NoteRow from '../components/notes/NoteRow';
import { DELETED_NOTES } from '../graphql/queries';
import { RESTORE_NOTE, PURGE_NOTE } from '../graphql/mutations';
import { onNoteRestored } from '../graphql/cacheUpdates';
import { layout } from '../theme/tokens';
import useNoteStore from '../store/noteStore';
import { useListWidth } from '../components/notes/ListColumn';
import { useNoteSelection, rowSelectProps } from '../hooks/useNoteSelection';
import { SelectButton, SelectingHeader } from '../components/select/SelectControl';
import SelectionBar from '../components/select/SelectionBar';

const plural = (n) => `${n} note${n === 1 ? '' : 's'}`;

/**
 * Recently deleted (`/deleted`; contract C4, review 2026-11 1.19).
 *
 * A deleted note waits here for 30 days with its history, then the server
 * purges it. It works the way Archived does (review 2026-11-18 #8, "both bins
 * work one way"): a row opens the note (with its "Deleted · Restore"
 * banner); select mode puts several back, or deletes them forever. Restore
 * is the bar's primary. Delete forever is the only irreversible act in the
 * app, so it asks first, with Cancel focused, in error ink.
 * Reached from the Tags panel (beside Archived) and from Settings.
 */
export default function DeletedNotes() {
  const theme = useTheme();
  const listWidth = useListWidth();
  const { notify } = useToast();
  const selection = useNoteSelection();
  const [confirm, setConfirm] = useState(null); // ids to delete forever
  const { data, loading, error, refetch } = useQuery(DELETED_NOTES, { variables: { limit: 200 }, fetchPolicy: 'cache-and-network' });
  const client = useApolloClient();
  // No per-call cache `update`: each one evicted the lists, and every live
  // list refetched once per note in the batch. The batch evicts once, below.
  const [restoreMutation] = useMutation(RESTORE_NOTE);
  const [purgeMutation] = useMutation(PURGE_NOTE);
  // Held for the whole batch. Apollo's per-call `loading` drops to false
  // between one note and the next, which re-enabled the bar mid-batch.
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const notes = data?.deletedNotes || [];

  // One id at a time: the gateway has no batch restore or purge for the bin.
  // What went through leaves the selection; what failed stays selected.
  // `settle(done)` runs once, after the last call, for the cache.
  const runBatch = async (ids, one, settle) => {
    if (runningRef.current) return null;
    runningRef.current = true;
    setRunning(true);
    const done = [];
    let failure = null;
    try {
      for (const id of ids) {
        try {
          await one(id);
          done.push(id);
        } catch (err) {
          failure = failure || err;
        }
      }
      if (done.length) {
        try { settle(done); } catch { /* never fail the batch on the cache */ }
      }
      await refetch().catch(() => {});
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
    if (failure) selection.remove(done);
    else selection.exit();
    return { done, failure };
  };

  const restore = async (ids) => {
    const result = await runBatch(
      ids,
      (id) => restoreMutation({ variables: { id } }),
      () => onNoteRestored(client.cache),
    );
    if (!result) return;
    const { done, failure } = result;
    if (done.length) {
      useNoteStore.getState().refreshLists?.();
      notify(`Restored ${plural(done.length)}`, { tone: 'success' });
    }
    if (failure) notify(failure?.message || 'Could not restore the note.', { tone: 'error' });
  };

  const purge = async (ids) => {
    setConfirm(null);
    const result = await runBatch(
      ids,
      (id) => purgeMutation({ variables: { id } }),
      (done) => {
        for (const id of done) {
          const ref = client.cache.identify({ __typename: 'Note', id: String(id) });
          if (ref) client.cache.evict({ id: ref });
        }
        client.cache.evict({ id: 'ROOT_QUERY', fieldName: 'deletedNotes' });
        client.cache.gc();
      },
    );
    if (!result) return;
    const { done, failure } = result;
    if (done.length) notify(done.length === 1 ? 'Deleted forever' : `Deleted ${plural(done.length)} forever`, { tone: 'success' });
    if (failure) notify(failure?.message || 'Could not delete the note.', { tone: 'error' });
  };

  const confirmTitle = confirm?.length === 1
    ? (notes.find((n) => String(n.id) === String(confirm[0]))?.title || 'This note')
    : null;

  return (
    <Box sx={{ py: { xs: '8px', sm: '16px' }, px: { xs: '8px', sm: 0 }, maxWidth: listWidth, mx: 'auto' }}>
      {selection.active ? <SelectingHeader selection={selection} /> : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', px: '4px', mb: '4px', minHeight: 44 }}>
          <Typography component="h1" variant="h6" sx={{ color: 'text.primary', m: 0, mr: 'auto' }}>
            Recently deleted
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
          icon={<DeleteOutline sx={{ fontSize: 28 }} />}
          title="Nothing deleted"
          description="A note you delete waits here for 30 days, with its history, before it is gone for good."
        />
      ) : (
        <>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.5, px: '8px', mb: '8px' }}>
            Kept for 30 days, then removed for good. Open one to read it, or select some to restore.
          </Typography>
          <Box component="section" aria-label="Deleted notes">
            {notes.map((note, idx) => (
              <React.Fragment key={note.id}>
                {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
                <Box data-deleted-row={note.id}>
                  <NoteRow note={note} dateField="deletedAt" {...rowSelectProps(selection, note)} />
                </Box>
              </React.Fragment>
            ))}
          </Box>
        </>
      )}

      <SelectionBar
        selection={selection}
        deleted={{ onRestore: restore, onPurge: (ids) => setConfirm(ids), busy: running }}
      />

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
          {confirmTitle
            ? `${confirmTitle} and its history will be removed for good. This cannot be undone.`
            : `${plural(confirm?.length || 0)} and their history will be removed for good. This cannot be undone.`}
        </Typography>
      </GeekDialog>
    </Box>
  );
}
