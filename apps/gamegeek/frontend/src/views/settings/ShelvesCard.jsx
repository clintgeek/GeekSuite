/** Custom shelves — "Couch co-op", "Kid-friendly", "Comfort games". */
import React, { useState } from 'react';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import { DeleteOutline as DeleteIcon } from '@mui/icons-material';
import { useApolloClient, useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { ADD_GAME_SHELF, REMOVE_GAME_SHELF } from '../../graphql/mutations';
import { GET_GAME_PROFILE } from '../../graphql/queries';
import { resetLibraryLists } from '../../graphql/cachePolicies';
import SettingsCard from './SettingsCard';

export default function ShelvesCard({ profile }) {
  const { notify } = useToast();
  const [label, setLabel] = useState('');
  const [addShelf, { loading: adding }] = useMutation(ADD_GAME_SHELF, { refetchQueries: ['GetGameShelves'] });
  const client = useApolloClient();
  // Removing a shelf unshelves its games across the library: a bulk change,
  // so the cached lists are dropped (they reload fresh) rather than refetched.
  const [removeShelf] = useMutation(REMOVE_GAME_SHELF, {
    refetchQueries: [{ query: GET_GAME_PROFILE }, 'GetGameShelves'],
    onCompleted: () => resetLibraryLists(client),
  });
  const shelves = profile?.customShelves ?? [];

  const add = async (e) => {
    e.preventDefault();
    const name = label.trim();
    if (!name) return;
    if (shelves.some((s) => s.label.toLowerCase() === name.toLowerCase())) {
      notify(`You already have a “${name}” shelf.`, { tone: 'info' });
      return;
    }
    try {
      await addShelf({ variables: { label: name } });
      setLabel('');
    } catch (err) {
      notify(err?.message || 'That shelf did not save.', { tone: 'error' });
    }
  };

  const remove = async (shelf) => {
    try {
      const res = await removeShelf({ variables: { id: shelf.id } });
      const n = res.data?.removeGameShelf?.clearedGames ?? 0;
      notify(n ? `Removed “${shelf.label}” — ${n} ${n === 1 ? 'game is' : 'games are'} unshelved now.` : `Removed “${shelf.label}”.`, { tone: 'success' });
    } catch {
      notify('That shelf could not be removed.', { tone: 'error' });
    }
  };

  return (
    <SettingsCard id="shelves" title="Your shelves" description="The six built-in shelves are always there. Add your own for anything else you sort by.">
      {shelves.length ? (
        <Box component="ul" sx={{ m: 0, p: 0, mb: 2 }}>
          {shelves.map((s) => (
            <Box component="li" key={s.id} sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderBottom: 1, borderColor: 'divider' }}>
              <Typography sx={{ fontSize: '0.9375rem' }}>{s.label}</Typography>
              <IconButton onClick={() => remove(s)} aria-label={`Remove the “${s.label}” shelf`} sx={{ color: 'text.secondary' }}>
                <DeleteIcon />
              </IconButton>
            </Box>
          ))}
        </Box>
      ) : null}
      <Box component="form" onSubmit={add} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', maxWidth: 480 }}>
        <TextField label="New shelf" placeholder="Couch co-op" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth inputProps={{ maxLength: 60 }} />
        <Button type="submit" variant="contained" disabled={adding || !label.trim()} sx={{ minHeight: 56, flexShrink: 0 }}>
          Add
        </Button>
      </Box>
    </SettingsCard>
  );
}
