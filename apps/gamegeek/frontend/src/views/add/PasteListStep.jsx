/**
 * Paste a list — the bulk path for libraries with no public API (GOG, Epic,
 * Amazon, Luna). One title per line; titles already in the household are
 * skipped by the gateway, and the result says how many.
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import { CheckCircleOutline as DoneIcon } from '@mui/icons-material';
import { useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { CREATE_GAMES } from '../../graphql/mutations';
import { PASTE_LIST_MAX, parsePasteList } from '../../utils/pasteList';
import { defaultStorefrontFor, formatLabel, platformLabel, storefrontLabel } from '../../utils/vocab';
import { pasteInputs } from './candidate';

const PC_STORES = ['steam', 'gog', 'epic', 'amazon', 'itch', 'ea', 'ubisoft', 'battle-net', 'microsoft'];
const PC_PLATFORMS = ['pc', 'steam-deck', 'mac', 'linux'];

function Pick({ id, label, value, onChange, options, render, empty }) {
  return (
    <FormControl fullWidth>
      <InputLabel id={id}>{label}</InputLabel>
      <Select labelId={id} label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {empty ? <MenuItem value=""><em>{empty}</em></MenuItem> : null}
        {options.map((o) => <MenuItem key={o} value={o}>{render(o)}</MenuItem>)}
      </Select>
    </FormControl>
  );
}

export default function PasteListStep({ vocab, shelves, profile, onDone }) {
  const { notify } = useToast();
  const [text, setText] = useState('');
  // The paste path is mostly PC storefronts, so it starts on PC + GOG.
  const [platform, setPlatform] = useState('pc');
  const [format, setFormat] = useState('digital');
  const [storefront, setStorefront] = useState('gog');
  const [shelf, setShelf] = useState('backlog');
  const [result, setResult] = useState(null);
  const [createGames, { loading }] = useMutation(CREATE_GAMES, { refetchQueries: ['GetGames', 'GetGameShelves'] });

  const parsed = useMemo(() => parsePasteList(text), [text]);

  // A PC store implies a PC copy; Luna is cloud. Pick the store, the platform follows.
  const pickStore = (store) => {
    setStorefront(store);
    if (PC_STORES.includes(store) && !PC_PLATFORMS.includes(platform)) setPlatform('pc');
    if (store === 'luna') setPlatform('cloud');
  };

  const submit = async () => {
    if (!parsed.titles.length) return;
    try {
      const res = await createGames({ variables: { inputs: pasteInputs(parsed.titles, { platform, format, storefront }), shelf } });
      const created = res.data?.createGames?.length ?? 0;
      setResult({ created, skipped: parsed.titles.length - created });
      setText('');
    } catch (err) {
      notify(err?.message || 'That list did not import.', { tone: 'error' });
    }
  };

  if (result) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
        <DoneIcon sx={{ fontSize: 44, color: 'success.main', mb: 1 }} />
        <Typography variant="h3" component="p" sx={{ mb: 1 }}>
          Added {result.created} {result.created === 1 ? 'game' : 'games'}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          {result.skipped
            ? `${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} already in the library and left alone.`
            : 'None of them were duplicates.'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => setResult(null)} sx={{ color: 'text.primary' }}>Paste another list</Button>
          <Button variant="contained" onClick={onDone}>See the library</Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.6 }}>
        Got games on GOG, Epic, Amazon or Luna? Paste the titles — one per line — and say where they live. Bullets and numbering are fine; titles already in the library are skipped.
      </Typography>
      <TextField
        label="Titles"
        placeholder={'Disco Elysium\nCeleste\nHades'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        multiline
        minRows={7}
        maxRows={16}
        fullWidth
        helperText={
          parsed.titles.length
            ? `${parsed.titles.length} ${parsed.titles.length === 1 ? 'title' : 'titles'}` +
              (parsed.duplicates ? ` · ${parsed.duplicates} repeated line${parsed.duplicates === 1 ? '' : 's'} dropped` : '') +
              (parsed.overflow ? ` · ${parsed.overflow} over the ${PASTE_LIST_MAX} limit — paste those next` : '')
            : 'One title per line'
        }
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mt: 0.5 }}>
        <Pick
          id="paste-platform"
          label="Platform"
          value={platform}
          onChange={(p) => {
            setPlatform(p);
            if (!PC_STORES.includes(storefront) || !PC_PLATFORMS.includes(p)) setStorefront(defaultStorefrontFor(p));
          }}
          options={vocab.platforms}
          render={platformLabel}
          empty="No copy"
        />
        <Pick id="paste-format" label="Format" value={format} onChange={setFormat} options={vocab.copyFormats} render={formatLabel} empty="Not recorded" />
        <Pick id="paste-store" label="Storefront" value={storefront} onChange={pickStore} options={vocab.storefronts} render={storefrontLabel} empty="Not recorded" />
        <Pick id="paste-shelf" label="Shelf" value={shelf} onChange={setShelf} options={shelves.map((s) => s.id)} render={(id) => shelves.find((s) => s.id === id)?.label || id} />
      </Box>
      <Button variant="contained" onClick={submit} disabled={loading || !parsed.titles.length} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
        {loading ? 'Adding…' : parsed.titles.length ? `Add ${parsed.titles.length} ${parsed.titles.length === 1 ? 'game' : 'games'}` : 'Add games'}
      </Button>
    </Box>
  );
}
