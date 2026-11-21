/**
 * Settings → Deleted games (SUITE_REVIEW_2026-11 S-D1, 2026-11-16).
 *
 * Delete is household-wide, so this list is too. A game deleted since
 * 2026-11-16 has a snapshot: Restore brings it back now with its Playnite link
 * and every member's shelf, rating and notes. An older delete (or a Playnite
 * copy removed by hand) has none: Restore only stops the Playnite import
 * skipping it, and the next import adds it back fresh. Each row says which.
 */
import React, { useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { GET_DELETED_GAMES } from '../../graphql/queries';
import { RESTORE_DELETED_GAME } from '../../graphql/mutations';
import { resetLibraryLists } from '../../graphql/cachePolicies';
import { instantParts } from '../../utils/dates';
import SettingsCard from './SettingsCard';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** What Restore will do for this entry, in one line. */
export function restoreHint(entry) {
  if (entry.hasSnapshot) {
    return entry.members > 0
      ? `Restore brings it back with ${entry.members === 1 ? 'the' : 'everyone’s'} shelf, rating and notes (${plural(entry.members, 'person', 'people')}).`
      : 'Restore brings it back as it was.';
  }
  if (entry.reason === 'copy-removed') {
    return 'A Playnite copy removed by hand. Restore lets the next Playnite import add it back.';
  }
  return 'Deleted before restore existed, so nothing was kept. Restore lets the next Playnite import add it back, without shelves or ratings.';
}

function deletedLine(entry) {
  const { text: when, relative } = instantParts(entry.deletedAt);
  const who = entry.deletedByName ? ` by ${entry.deletedByName}` : '';
  if (!when) return `Deleted${who}`;
  // Relative words read lower-case mid-sentence; a date ("Nov 3") keeps its case.
  const said = relative ? when.toLowerCase() : `on ${when}`;
  return `Deleted ${said}${who}`;
}

export default function DeletedGamesCard() {
  const client = useApolloClient();
  const { notify } = useToast();
  const { data, loading, error, refetch } = useQuery(GET_DELETED_GAMES, { fetchPolicy: 'cache-and-network' });
  const [restore] = useMutation(RESTORE_DELETED_GAME);
  const [busyId, setBusyId] = useState(null);
  const entries = data?.deletedGames ?? [];

  const onRestore = async (entry) => {
    setBusyId(entry.id);
    try {
      const res = await restore({ variables: { id: entry.id } });
      const out = res.data?.restoreDeletedGame;
      if (!out?.success) throw new Error(out?.message || 'Restore failed');
      notify(
        out.waitsForImport
          ? `${entry.title} comes back with the next Playnite import.`
          : `${entry.title} is back in the library.`,
        { tone: 'success' }
      );
      // A game re-entered the catalog: cached lists reload fresh, counts refetch.
      resetLibraryLists(client);
      await client.refetchQueries({ include: ['GetDeletedGames', 'GetGameShelves'] });
    } catch (err) {
      notify(err?.message?.length < 160 ? err.message : `Couldn't restore ${entry.title}.`, { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  let body;
  if (!data && loading) {
    body = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={18} aria-label="Loading deleted games" />
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Loading…</Typography>
      </Box>
    );
  } else if (!data && error) {
    // A failed read is not "nothing deleted".
    body = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>The deleted games didn&apos;t load.</Typography>
        <Button variant="outlined" onClick={() => refetch()} sx={{ color: 'text.primary' }}>
          Try again
        </Button>
      </Box>
    );
  } else if (entries.length === 0) {
    body = (
      <Typography data-testid="deleted-games-empty" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
        Nothing deleted. A game you delete shows up here, ready to restore.
      </Typography>
    );
  } else {
    body = (
      <Box component="ul" data-testid="deleted-games-list" sx={{ m: 0, p: 0 }}>
        {entries.map((e) => (
          <Box
            component="li"
            key={e.id}
            sx={{
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              py: 1.25,
              borderBottom: 1,
              borderColor: 'divider',
              '&:last-of-type': { borderBottom: 0 },
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{e.title}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>{deletedLine(e)}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25, lineHeight: 1.5 }}>{restoreHint(e)}</Typography>
            </Box>
            <Button
              variant="outlined"
              onClick={() => onRestore(e)}
              disabled={busyId !== null}
              aria-label={`Restore ${e.title}`}
              sx={{ minHeight: 44, flexShrink: 0, color: 'text.primary' }}
            >
              {busyId === e.id ? 'Restoring…' : 'Restore'}
            </Button>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <SettingsCard
      id="deleted"
      title="Deleted games"
      description="Games anyone in the household deleted. Playnite skips these on import until they're restored."
    >
      {body}
    </SettingsCard>
  );
}
