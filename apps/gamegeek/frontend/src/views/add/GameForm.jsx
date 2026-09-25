/**
 * Step two of Add game: the prefilled form. Everything a search found is
 * already in it; the copies row is the one thing only you know.
 */
import React from 'react';
import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, ToggleButton, Typography } from '@mui/material';
import { ArrowBack as BackIcon } from '@mui/icons-material';
import CopyRowsEditor from '../../components/CopyRowsEditor';
import GameCover from '../../components/GameCover';
import { platformLabel } from '../../utils/vocab';
import { selectChipSx } from '../../theme/chipStyles';


function Label({ children }) {
  return (
    <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>
      {children}
    </Typography>
  );
}

export default function GameForm({ form, setForm, vocab, shelves, profile, onBack, fromSearch }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const togglePlatform = (p) =>
    setForm((f) => ({
      ...f,
      platformsAvailable: f.platformsAvailable.includes(p) ? f.platformsAvailable.filter((x) => x !== p) : [...f.platformsAvailable, p],
    }));
  const COMMON = ['pc', 'steam-deck', 'switch', 'switch-2', 'ps5', 'ps4', 'xbox-series', 'mac'];
  const platformOptions = [...new Set([...form.platformsAvailable, ...COMMON])].filter((p) => vocab.platforms.includes(p));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <Box sx={{ width: 84, flexShrink: 0 }}>
          <GameCover game={{ title: form.title || 'New game', coverUrl: form.coverUrl, platformsAvailable: form.platformsAvailable, copies: form.copies }} radius={6} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Button startIcon={<BackIcon />} onClick={onBack} sx={{ color: 'text.secondary', ml: -1 }}>
            {fromSearch ? 'Back to results' : 'Back to search'}
          </Button>
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
            {form.coverUrl ? 'The cover is fetched and saved when you add it.' : 'No cover yet — a title plate stands in until you add art.'}
          </Typography>
        </Box>
      </Box>

      <TextField label="Title" value={form.title} onChange={set('title')} required fullWidth inputProps={{ maxLength: 300 }} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField type="date" label="Release date" value={form.releaseDate} onChange={set('releaseDate')} InputLabelProps={{ shrink: true }} />
        <FormControl fullWidth>
          <InputLabel id="add-shelf">Shelf</InputLabel>
          <Select labelId="add-shelf" label="Shelf" value={form.shelf} onChange={set('shelf')}>
            {shelves.map((s) => <MenuItem key={s.id} value={s.id}>{s.label}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Developer" helperText="Comma-separated if more than one" value={form.developers} onChange={set('developers')} />
        <TextField label="Genres" helperText="Comma-separated" value={form.genres} onChange={set('genres')} />
      </Box>

      <Box>
        <Label>Copies we own</Label>
        {form.shelf === 'wishlist' && form.copies.length ? (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
            Wishlist games usually have no copy yet — remove the row if you don't own it.
          </Typography>
        ) : null}
        <CopyRowsEditor
          idPrefix="add-copy"
          rows={form.copies}
          onChange={(copies) => setForm((f) => ({ ...f, copies }))}
          vocab={vocab}
          defaultPlatform={profile?.defaultPlatform || form.platformsAvailable[0]}
        />
      </Box>

      <Box>
        <Label>Released on</Label>
        <Box role="group" aria-label="Released on" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {platformOptions.map((p) => (
            <ToggleButton key={p} value={p} selected={form.platformsAvailable.includes(p)} onChange={() => togglePlatform(p)} sx={selectChipSx}>
              {platformLabel(p)}
            </ToggleButton>
          ))}
        </Box>
      </Box>

      <TextField label="Description" value={form.description} onChange={set('description')} multiline minRows={3} fullWidth inputProps={{ maxLength: 5000 }} />
    </Box>
  );
}
