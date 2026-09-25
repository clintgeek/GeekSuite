/** The hardware in the house, and which one sessions default to. */
import React, { useEffect, useState } from 'react';
import { Box, Button, FormControl, InputLabel, MenuItem, Select, ToggleButton } from '@mui/material';
import { useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { SAVE_GAME_PROFILE } from '../../graphql/mutations';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { platformLabel, sortPlatforms } from '../../utils/vocab';
import SettingsCard from './SettingsCard';
import { selectChipSx } from '../../theme/chipStyles';

const COMMON = ['pc', 'steam-deck', 'mac', 'linux', 'switch', 'switch-2', 'ps5', 'ps4', 'xbox-series', 'xbox-one', 'ios', 'android', 'cloud'];


export default function PlatformsCard({ profile, vocab }) {
  const { notify } = useToast();
  const [owned, setOwned] = useState(profile?.platformsOwned ?? []);
  const [defaultPlatform, setDefaultPlatform] = useState(profile?.defaultPlatform ?? '');
  const [showAll, setShowAll] = useState(false);
  const [save] = useMutation(SAVE_GAME_PROFILE);

  useEffect(() => {
    setOwned(profile?.platformsOwned ?? []);
    setDefaultPlatform(profile?.defaultPlatform ?? '');
  }, [profile?.platformsOwned, profile?.defaultPlatform]);

  const persist = useDebouncedCallback((input) => {
    save({ variables: { input } }).catch(() => notify('Platforms did not save.', { tone: 'error' }));
  }, 500);

  const toggle = (p) => {
    const next = owned.includes(p) ? owned.filter((x) => x !== p) : sortPlatforms([...owned, p], vocab.platforms);
    const nextDefault = next.includes(defaultPlatform) ? defaultPlatform : next[0] || '';
    setOwned(next);
    setDefaultPlatform(nextDefault);
    persist({ platformsOwned: next, defaultPlatform: nextDefault });
  };

  const options = showAll ? vocab.platforms : [...new Set([...COMMON.filter((p) => vocab.platforms.includes(p)), ...owned])];

  return (
    <SettingsCard id="platforms" title="Platforms in the house" description="What you play on. It shapes the platform picker when you log a session or add a copy.">
      <Box role="group" aria-label="Platforms I own" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {options.map((p) => (
          <ToggleButton key={p} value={p} selected={owned.includes(p)} onChange={() => toggle(p)} sx={selectChipSx}>
            {platformLabel(p)}
          </ToggleButton>
        ))}
      </Box>
      {!showAll ? (
        <Button onClick={() => setShowAll(true)} sx={{ mt: 1, ml: -1, color: 'text.secondary' }}>
          Retro and everything else…
        </Button>
      ) : null}
      <FormControl fullWidth sx={{ mt: 2, maxWidth: 360 }} disabled={!owned.length}>
        <InputLabel id="default-platform-label">Default platform</InputLabel>
        <Select
          labelId="default-platform-label"
          label="Default platform"
          value={owned.includes(defaultPlatform) ? defaultPlatform : ''}
          onChange={(e) => {
            setDefaultPlatform(e.target.value);
            persist({ platformsOwned: owned, defaultPlatform: e.target.value });
          }}
        >
          <MenuItem value=""><em>None</em></MenuItem>
          {owned.map((p) => <MenuItem key={p} value={p}>{platformLabel(p)}</MenuItem>)}
        </Select>
      </FormControl>
    </SettingsCard>
  );
}
