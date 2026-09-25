/**
 * `/add` — Add a game, over the library. Two ways in:
 *   Search:        title → pick a result → prefilled form → Add
 *                  (or "Enter manually" → the same form, empty)
 *   Paste a list:  many titles at once, for stores with no API
 *
 * `/add?tab=paste` deep-links the second tab (the empty library and Settings
 * point there). After an add from search the sheet lands on the new game.
 */
import React, { useState } from 'react';
import { Box, Button, Tab, Tabs } from '@mui/material';
import { useMutation } from '@apollo/client';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { GeekSheet, useToast } from '@geeksuite/ui';
import { fetchCover } from '../../api/rest';
import { CREATE_GAME } from '../../graphql/mutations';
import { useGameProfile, useShelfList, useVocabulary } from '../../hooks/useGameMeta';
import { gamePath, libraryPath } from '../../components/navConfig';
import { candidateToForm, emptyForm, formToCreateInput } from './candidate';
import GameForm from './GameForm';
import PasteListStep from './PasteListStep';
import SearchStep from './SearchStep';

function withoutTab(search) {
  const p = new URLSearchParams(search);
  p.delete('tab');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function AddGameDialog() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { notify } = useToast();
  const vocab = useVocabulary();
  const { profile } = useGameProfile();
  const shelves = useShelfList();

  const tab = params.get('tab') === 'paste' ? 'paste' : 'search';
  const [form, setForm] = useState(null); // null = searching
  const [fromSearch, setFromSearch] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [createGame, { loading }] = useMutation(CREATE_GAME, { refetchQueries: ['GetGames', 'GetGameShelves'] });

  const librarySearch = withoutTab(location.search);
  const close = () => navigate(libraryPath(librarySearch));

  const setTab = (next) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'paste') p.set('tab', 'paste');
        else p.delete('tab');
        return p;
      },
      { replace: true }
    );

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

  const showForm = tab === 'search' && form;

  return (
    <GeekSheet
      open
      onClose={close}
      snap="full"
      maxWidth="md"
      title="Add a game"
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
      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        aria-label="How to add"
        variant="fullWidth"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { color: 'text.secondary' }, '& .Mui-selected': { color: 'text.primary' } }}
      >
        <Tab value="search" label="Search" />
        <Tab value="paste" label="Paste a list" />
      </Tabs>

      <Box sx={{ pb: 3 }}>
        {tab === 'paste' ? (
          <PasteListStep vocab={vocab} shelves={shelves} profile={profile} onDone={close} />
        ) : form ? (
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
