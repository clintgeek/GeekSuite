/**
 * Cover tools: find art (the metadata search, by this game's title), upload
 * your own, or remove it. Art is always fetched and cached by the gamegeek
 * backend — never hotlinked.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, TextField, Typography } from '@mui/material';
import { DeleteOutline as DeleteIcon, FileUploadOutlined as UploadIcon, Search as SearchIcon } from '@mui/icons-material';
import { GeekDialog, useToast } from '@geeksuite/ui';
import { searchMetadata } from '../../api/rest';
import GameCover from '../../components/GameCover';

export default function CoverToolsDialog({ open, onClose, game, onFetch, onUpload, onRemove }) {
  const { notify } = useToast();
  const fileRef = useRef(null);
  const [query, setQuery] = useState(game?.title || '');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (open) {
      setQuery(game?.title || '');
      setResults(null);
    }
  }, [open, game?.title]);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchMetadata(query.trim(), { limit: 12 });
      setResults((res?.results || []).filter((r) => r.coverUrl));
    } catch (err) {
      notify(err?.message || 'Art search failed.', { tone: 'error' });
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const run = async (key, fn, ok) => {
    setBusy(key);
    try {
      await fn();
      notify(ok, { tone: 'success' });
      onClose();
    } catch (err) {
      notify(err?.message || 'That did not work.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title="Cover art"
      maxWidth="sm"
      primaryAction={<Button onClick={onClose} variant="contained">Done</Button>}
    >
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 2.5 }}>
        <Box sx={{ width: 96, flexShrink: 0 }}>
          <GameCover game={game} variant="card" radius={6} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => fileRef.current?.click()}
            disabled={Boolean(busy)}
            sx={{ color: 'text.primary' }}
          >
            {busy === 'upload' ? 'Uploading…' : 'Upload an image'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            aria-label="Choose a cover image"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) run('upload', () => onUpload(file), 'Cover uploaded.');
            }}
          />
          {game?.coverUrl ? (
            <Button
              startIcon={<DeleteIcon />}
              onClick={() => run('remove', onRemove, 'Cover removed — the title plate is back.')}
              disabled={Boolean(busy)}
              sx={{ color: 'text.secondary' }}
            >
              Remove cover
            </Button>
          ) : (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>No art yet — the title plate stands in.</Typography>
          )}
        </Box>
      </Box>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}
      >
        <TextField fullWidth label="Find art for" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} disabled={searching} sx={{ minHeight: 56 }}>
          Search
        </Button>
      </Box>

      {searching ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
          <CircularProgress size={24} aria-label="Searching for art" />
        </Box>
      ) : results ? (
        results.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1.25, mt: 2 }}>
            {results.map((r) => (
              <ButtonBase
                key={`${r.provider}-${r.providerId}`}
                onClick={() => run(`fetch-${r.providerId}`, () => onFetch(r.coverUrl), 'Cover updated.')}
                disabled={Boolean(busy)}
                aria-label={`Use the cover from ${r.title}${r.releaseDate ? ` (${new Date(r.releaseDate).getUTCFullYear()})` : ''}`}
                sx={{ display: 'block', borderRadius: '8px', overflow: 'hidden', textAlign: 'left' }}
              >
                <Box component="img" src={r.coverUrl} alt="" loading="lazy" sx={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', bgcolor: 'background.raised' }} />
                <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>{r.title}</Typography>
              </ButtonBase>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 2 }}>
            No art found for that search. Try the game's original title, or upload your own.
          </Typography>
        )
      ) : null}
    </GeekDialog>
  );
}
