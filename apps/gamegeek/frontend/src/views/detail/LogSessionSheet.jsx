/**
 * "Played 1.5h tonight" in two taps: today is already picked, tap a length,
 * tap Log. The platform defaults to the profile's default when the game is
 * on it, else the game's first copy.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { GeekSheet, useToast } from '@geeksuite/ui';
import { chipGroupSx } from '../../theme/chipStyles';
import { formatMinutes, todayInputValue } from '../../utils/dates';
import { platformLabel, sortPlatforms } from '../../utils/vocab';
import { MINUTE_PRESETS, buildSessionInput, parseMinutes } from './sessionInput';


export function defaultSessionPlatform(game, profile) {
  const copies = (game?.copies || []).map((c) => c.platform).filter(Boolean);
  if (profile?.defaultPlatform && (copies.length === 0 || copies.includes(profile.defaultPlatform))) return profile.defaultPlatform;
  return copies[0] || game?.platformsAvailable?.[0] || '';
}

export default function LogSessionSheet({ open, onClose, game, profile, vocabPlatforms, onSubmit }) {
  const { notify } = useToast();
  const [date, setDate] = useState(todayInputValue());
  const [preset, setPreset] = useState(60);
  const [custom, setCustom] = useState('');
  const [platform, setPlatform] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(todayInputValue());
    setPreset(60);
    setCustom('');
    setNote('');
    setPlatform(defaultSessionPlatform(game, profile));
  }, [open, game, profile]);

  const minutes = preset === 'custom' ? parseMinutes(custom) : preset;
  const options = sortPlatforms([
    ...(game?.copies || []).map((c) => c.platform),
    ...(profile?.platformsOwned || []),
    ...(platform ? [platform] : []),
  ]);
  const everything = options.length ? options : vocabPlatforms;

  const submit = async () => {
    const { input, error } = buildSessionInput({ date, minutes, platform, note });
    if (error) {
      notify(error, { tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await onSubmit(input);
      onClose();
    } catch {
      notify('That session did not save. Try again.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title="Log a session"
      description={game?.title}
      actions={
        <Button variant="contained" fullWidth disabled={busy || !minutes} onClick={submit}>
          {minutes ? `Log ${formatMinutes(minutes)}` : 'Log session'}
        </Button>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1, pb: 2 }}>
        <Box>
          <Typography id="session-length" component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>
            How long
          </Typography>
          <ToggleButtonGroup
            exclusive
            aria-labelledby="session-length"
            value={preset}
            onChange={(_e, v) => v !== null && setPreset(v)}
            sx={chipGroupSx}
          >
            {MINUTE_PRESETS.map((m) => (
              <ToggleButton key={m} value={m}>{formatMinutes(m)}</ToggleButton>
            ))}
            <ToggleButton value="custom">Other</ToggleButton>
          </ToggleButtonGroup>
          {preset === 'custom' ? (
            <TextField
              autoFocus
              fullWidth
              label="Length"
              placeholder="e.g. 45, 2h, 1:15"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              helperText={custom && !parseMinutes(custom) ? 'Try minutes (45), hours (2h) or 1:15.' : ' '}
              error={Boolean(custom && !parseMinutes(custom))}
              sx={{ mt: 1.5 }}
            />
          ) : null}
        </Box>

        <TextField
          type="date"
          label="Day"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ max: todayInputValue() }}
          fullWidth
        />

        <FormControl fullWidth>
          <InputLabel id="session-platform-label">Platform</InputLabel>
          <Select
            labelId="session-platform-label"
            label="Platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <MenuItem value="">
              <em>Not recorded</em>
            </MenuItem>
            {everything.map((p) => (
              <MenuItem key={p} value={p}>{platformLabel(p)}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Note (optional)"
          placeholder="Beat the second boss"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          fullWidth
          inputProps={{ maxLength: 500 }}
        />
      </Box>
    </GeekSheet>
  );
}
