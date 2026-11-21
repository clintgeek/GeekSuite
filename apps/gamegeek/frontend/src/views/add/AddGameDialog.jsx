/**
 * `/add` — Add a game, over the library.
 *   Search: title → pick a result → prefilled form → Add
 *           (or "Enter manually" → the same form, empty)
 *
 * After an add from search the sheet lands on the new game. Bulk imports
 * (a whole library at once) are Playnite's job — see Settings.
 */
import React, { useState } from 'react';
import { Box, Button } from '@mui/material';
import { useMutation } from '@apollo/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekSheet, useToast } from '@geeksuite/ui';
import { fetchCover } from '../../api/rest';
import { CREATE_GAME } from '../../graphql/mutations';
import { useGameProfile, useShelfList, useVocabulary } from '../../hooks/useGameMeta';
import { useRefreshLibraryList } from '../../hooks/useLibrary';
import { gamePath, libraryPath } from '../../components/navConfig';
import { candidateToForm, emptyForm, formToCreateInput } from './candidate';
import GameForm from './GameForm';
import SearchStep from './SearchStep';
import { CLOSE_CLEARANCE } from '../detail/ActionBar';

export default function AddGameDialog() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();
  const vocab = useVocabulary();
  const { profile } = useGameProfile();
  const shelves = useShelfList();

  const [form, setForm] = useState(null); // null = searching
  const [fromSearch, setFromSearch] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  // Not 'GetGames': a refetch would collapse the scrolled library underneath.
  // The list refreshes in place once the game exists (hooks/useLibrary.js).
  const [createGame, { loading }] = useMutation(CREATE_GAME, { refetchQueries: ['GetGameShelves', 'GetGameFacets'] });
  const refreshList = useRefreshLibraryList();

  const librarySearch = location.search;
  const close = () => navigate(libraryPath(librarySearch));

  const submit = async () => {
    if (!form?.title.trim()) {
      notify('A game needs a title.', { tone: 'warning' });
      return;
    }
    try {
      const res = await createGame({ variables: { input: formToCreateInput(form), shelf: form.shelf || null } });
      const game = res.data?.createGame;
      if (!game) throw new Error('Nothing came back');
      notify(`Added ${game.title}.`, { tone: 'success' });
      refreshList(librarySearch).catch(() => {});
      if (form.coverUrl) {
        // Not awaited: the game exists either way, the art can follow.
        fetchCover(game.id, form.coverUrl).catch(() =>
          notify(`${game.title} was added, but its cover didn't download. Try More → Cover art.`, { tone: 'warning' })
        );
      }
      navigate(gamePath(game.id, librarySearch), { replace: true });
    } catch (err) {
      notify(err?.message?.length < 140 ? err.message : "That game didn't save. Try again.", { tone: 'error' });
    }
  };

  const showForm = Boolean(form);

  return (
    <GeekSheet
      open
      onClose={close}
      // A route (/add), like the detail sheet: Back already leaves it, and its
      // own Back entry would turn Back into a push to the library (a loop) and
      // leave /add behind the replace to /game/:id after Add.
      backToClose={false}
      snap="full"
      maxWidth="md"
      title="Add a game"
      // The close sits in the header row beside the title, not on the search
      // field's border (review 2026-11-18 #1): the row is as tall as the 44px
      // close plus its 8px inset, and the title clears it on the right.
      headerSx={{ minHeight: 60, alignItems: 'center', pr: CLOSE_CLEARANCE }}
      bodySx={{ px: { xs: 2, md: 3 } }}
      dialogProps={{ PaperProps: { sx: { height: 'min(88vh, 900px)' } } }}
      actions={
        showForm ? (
          <Button variant="contained" fullWidth onClick={submit} disabled={loading}>
            {loading ? 'Adding…' : 'Add to library'}
          </Button>
        ) : undefined
      }
    >
      {/* 12px above the field, so its floating label is not cut by the
          top of the scrolling body (it sat half under the heading). */}
      <Box sx={{ pt: 3, pb: 3 }}>
        {form ? (
          <GameForm
            form={form}
            setForm={setForm}
            vocab={vocab}
            shelves={shelves}
            profile={profile}
            fromSearch={fromSearch}
            onBack={() => setForm(null)}
          />
        ) : (
          <SearchStep
            initialQuery={lastQuery}
            onPick={(candidate) => {
              setLastQuery(candidate.title || '');
              setFromSearch(true);
              setForm(candidateToForm(candidate, { vocab, profile }));
            }}
            onManual={(title) => {
              setLastQuery(title);
              setFromSearch(false);
              setForm(emptyForm({ profile, title }));
            }}
            onImportPlaynite={() => navigate('/settings#playnite')}
          />
        )}
      </Box>
    </GeekSheet>
  );
}
