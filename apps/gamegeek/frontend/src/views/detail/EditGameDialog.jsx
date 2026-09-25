/**
 * Edit the catalogue entry: every GameInput field a person would type.
 * (Copies have their own editor; parentId/source are not hand-edited.)
 * List fields are comma-separated in the form and split on save.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, TextField, ToggleButton, Typography } from '@mui/material';
import { GeekDialog, useToast } from '@geeksuite/ui';
import { calendarDateToUtcIso, utcIsoToInputValue } from '../../utils/dates';
import { modeLabel, platformLabel } from '../../utils/vocab';
import { selectChipSx } from '../../theme/chipStyles';

const splitList = (s) => [...new Set(String(s || '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 50);
const num = (s) => {
  if (s === '' || s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function gameToForm(game) {
  return {
    title: game?.title || '',
    releaseDate: utcIsoToInputValue(game?.releaseDate),
    developers: (game?.developers || []).join(', '),
    publishers: (game?.publishers || []).join(', '),
    genres: (game?.genres || []).join(', '),
    tags: (game?.tags || []).join(', '),
    modes: game?.modes || [],
    platformsAvailable: game?.platformsAvailable || [],
    maxLocalPlayers: game?.maxLocalPlayers ?? '',
    description: game?.description || '',
    seriesName: game?.series?.name || '',
    seriesIndex: game?.series?.index ?? '',
    ttbMain: game?.timeToBeat?.main ?? '',
    ttbExtra: game?.timeToBeat?.extra ?? '',
    ttbComplete: game?.timeToBeat?.complete ?? '',
    steamAppId: game?.externalIds?.steamAppId || '',
    igdb: game?.externalIds?.igdb || '',
    gog: game?.externalIds?.gog || '',
    epic: game?.externalIds?.epic || '',
    rawg: game?.externalIds?.rawg || '',
  };
}

export function formToGameInput(f) {
  const maxLocal = num(f.maxLocalPlayers);
  return {
    title: f.title.trim(),
    releaseDate: calendarDateToUtcIso(f.releaseDate),
    developers: splitList(f.developers),
    publishers: splitList(f.publishers),
    genres: splitList(f.genres),
    tags: splitList(f.tags),
    modes: f.modes,
    platformsAvailable: f.platformsAvailable,
    maxLocalPlayers: maxLocal === null ? null : Math.round(maxLocal),
    description: f.description.trim(),
    series: f.seriesName.trim() ? { name: f.seriesName.trim(), index: num(f.seriesIndex) } : null,
    timeToBeat: { main: num(f.ttbMain), extra: num(f.ttbExtra), complete: num(f.ttbComplete) },
    externalIds: {
      steamAppId: f.steamAppId.trim() || null,
      igdb: f.igdb.trim() || null,
      gog: f.gog.trim() || null,
      epic: f.epic.trim() || null,
      rawg: f.rawg.trim() || null,
    },
  };
}


function MultiToggle({ label, options, value, onChange, render }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <Box>
      <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>
        {label}
      </Typography>
      <Box role="group" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {options.map((o) => (
          <ToggleButton key={o} value={o} selected={value.includes(o)} onChange={() => toggle(o)} sx={selectChipSx}>
            {render(o)}
          </ToggleButton>
        ))}
      </Box>
    </Box>
  );
}

export default function EditGameDialog({ open, onClose, game, vocab, onSave }) {
  const { notify } = useToast();
  const [form, setForm] = useState(() => gameToForm(game));
  const [busy, setBusy] = useState(false);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(gameToForm(game));
      setShowAllPlatforms(false);
    }
  }, [open, game]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const COMMON = ['pc', 'steam-deck', 'switch', 'switch-2', 'ps5', 'ps4', 'xbox-series', 'xbox-one', 'mac', 'linux', 'ios', 'android'];
  const platformOptions = showAllPlatforms
    ? vocab.platforms
    : [...new Set([...COMMON.filter((p) => vocab.platforms.includes(p)), ...form.platformsAvailable])];

  const save = async () => {
    if (!form.title.trim()) {
      notify('A game needs a title.', { tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await onSave(formToGameInput(form));
      onClose();
      notify('Details saved.', { tone: 'success' });
    } catch (err) {
      notify(err?.message?.includes('title') ? err.message : 'Those details did not save.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title="Edit details"
      maxWidth="md"
      primaryAction={<Button variant="contained" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>}
      secondaryAction={<Button onClick={onClose} sx={{ color: 'text.secondary' }}>Cancel</Button>}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
        <TextField label="Title" value={form.title} onChange={set('title')} required sx={{ gridColumn: '1 / -1' }} inputProps={{ maxLength: 300 }} />
        <TextField type="date" label="Release date" value={form.releaseDate} onChange={set('releaseDate')} InputLabelProps={{ shrink: true }} />
        <TextField label="Couch players (max)" value={form.maxLocalPlayers} onChange={set('maxLocalPlayers')} inputProps={{ inputMode: 'numeric' }} />
        <TextField label="Developers" helperText="Comma-separated" value={form.developers} onChange={set('developers')} />
        <TextField label="Publishers" helperText="Comma-separated" value={form.publishers} onChange={set('publishers')} />
        <TextField label="Genres" helperText="Comma-separated" value={form.genres} onChange={set('genres')} />
        <TextField label="Tags" helperText="Comma-separated" value={form.tags} onChange={set('tags')} />
        <TextField label="Description" value={form.description} onChange={set('description')} multiline minRows={4} sx={{ gridColumn: '1 / -1' }} inputProps={{ maxLength: 5000 }} />

        <Box sx={{ gridColumn: '1 / -1' }}>
          <MultiToggle label="Modes" options={vocab.modes} value={form.modes} onChange={(modes) => setForm((f) => ({ ...f, modes }))} render={modeLabel} />
        </Box>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <MultiToggle
            label="Released on"
            options={platformOptions}
            value={form.platformsAvailable}
            onChange={(platformsAvailable) => setForm((f) => ({ ...f, platformsAvailable }))}
            render={platformLabel}
          />
          {!showAllPlatforms ? (
            <Button onClick={() => setShowAllPlatforms(true)} sx={{ mt: 0.5, color: 'text.secondary' }}>Show every platform</Button>
          ) : null}
        </Box>

        <TextField label="Series" value={form.seriesName} onChange={set('seriesName')} />
        <TextField label="Number in series" value={form.seriesIndex} onChange={set('seriesIndex')} inputProps={{ inputMode: 'decimal' }} />

        <Box sx={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
          <TextField label="Story (h)" value={form.ttbMain} onChange={set('ttbMain')} inputProps={{ inputMode: 'decimal' }} />
          <TextField label="+ Extras (h)" value={form.ttbExtra} onChange={set('ttbExtra')} inputProps={{ inputMode: 'decimal' }} />
          <TextField label="100% (h)" value={form.ttbComplete} onChange={set('ttbComplete')} inputProps={{ inputMode: 'decimal' }} />
        </Box>

        <TextField label="Steam app id" value={form.steamAppId} onChange={set('steamAppId')} inputProps={{ inputMode: 'numeric' }} />
        <TextField label="IGDB id" value={form.igdb} onChange={set('igdb')} />
        <TextField label="GOG id / slug" value={form.gog} onChange={set('gog')} />
        <TextField label="Epic id / slug" value={form.epic} onChange={set('epic')} />
      </Box>
    </GeekDialog>
  );
}
