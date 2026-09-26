/**
 * My status: shelf, progress (debounced as it drags), hours with where they
 * came from, last played, favourite.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, FormControlLabel, InputAdornment, Slider, Switch, TextField, Typography } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import ShelfTag from '../../components/ShelfTag';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { useSetGameState } from '../../hooks/useGameActions';
import { formatHours, relativeInstant } from '../../utils/dates';
import { hoursSourceLabel, shelfLabel } from '../../utils/vocab';
import Section from './Section';

function Row({ label, children, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, minHeight: 44, ...sx }}>
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, justifyContent: 'flex-end' }}>{children}</Box>
    </Box>
  );
}

export default function StatusSection({ game, customShelves, onChangeShelf }) {
  const me = game.me || {};
  const setState = useSetGameState();
  const { notify } = useToast();

  const [progress, setProgress] = useState(me.progress ?? 0);
  useEffect(() => setProgress(me.progress ?? 0), [me.progress]);
  const saveProgress = useDebouncedCallback((value) => {
    setState(game.id, { progress: value }).catch(() => notify('Progress did not save.', { tone: 'error' }));
  }, 600);

  const [editingHours, setEditingHours] = useState(false);
  const [hoursText, setHoursText] = useState('');
  const hours = formatHours(me.hoursPlayed);

  const saveHours = async () => {
    const value = hoursText.trim() === '' ? 0 : Number(hoursText);
    if (!Number.isFinite(value) || value < 0 || value > 100000) {
      notify('Hours should be a number like 12.5.', { tone: 'warning' });
      return;
    }
    try {
      await setState(game.id, { hoursPlayed: value });
      setEditingHours(false);
    } catch {
      notify('Hours did not save.', { tone: 'error' });
    }
  };

  const toggleFavorite = (checked) => {
    setState(game.id, { favorite: checked }).catch(() => notify('Could not update favourite.', { tone: 'error' }));
  };

  const shelfName = me.shelf ? shelfLabel(me.shelf, customShelves) : 'Not on a shelf';

  return (
    <Section title="My status" id="status">
      <Row label="Shelf">
        <ShelfTag shelf={me.shelf || 'unshelved'} label={shelfName} />
        <Button onClick={onChangeShelf} sx={{ color: 'primary.main', fontWeight: 600, px: 1.5 }} aria-label={`Change shelf (now ${shelfName})`}>
          Change
        </Button>
      </Row>

      <Box sx={{ mt: 0.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Typography id={`progress-${game.id}`} sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            Progress
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(progress)}%</Typography>
        </Box>
        <Slider
          value={progress}
          min={0}
          max={100}
          step={5}
          aria-labelledby={`progress-${game.id}`}
          getAriaValueText={(v) => `${v} percent`}
          onChange={(_e, v) => {
            setProgress(v);
            saveProgress(v);
          }}
          sx={{ py: '20px', '& .MuiSlider-rail': { opacity: 0.35 }, color: 'primary.main' }}
        />
      </Box>

      {editingHours ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 0.5 }}>
          <TextField
            autoFocus
            size="small"
            label="Hours played"
            value={hoursText}
            onChange={(e) => setHoursText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveHours()}
            inputProps={{ inputMode: 'decimal' }}
            InputProps={{ endAdornment: <InputAdornment position="end">h</InputAdornment> }}
            helperText={me.hoursSource === 'steam' ? 'Editing makes these your own hours; Steam sync stops touching them.' : ' '}
            sx={{ flex: 1 }}
          />
          <Button variant="contained" onClick={saveHours}>Save</Button>
          <Button onClick={() => setEditingHours(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
        </Box>
      ) : (
        <Row label="Hours">
          <Box sx={{ textAlign: 'right', minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{hours || 'None yet'}</Typography>
            {hours && me.hoursSource ? (
              <Typography sx={{ fontSize: '0.75rem', color: 'text.muted' }}>{hoursSourceLabel(me.hoursSource)}</Typography>
            ) : null}
          </Box>
          <Button
            onClick={() => {
              setHoursText(me.hoursPlayed ? String(me.hoursPlayed) : '');
              setEditingHours(true);
            }}
            sx={{ color: 'primary.main', fontWeight: 600, px: 1.5 }}
            aria-label="Edit hours played"
          >
            Edit
          </Button>
        </Row>
      )}

      <Row label="Last played">
        <Typography sx={{ fontSize: '0.875rem' }}>{me.lastPlayedAt ? relativeInstant(me.lastPlayedAt) : 'Not yet'}</Typography>
      </Row>

      <FormControlLabel
        labelPlacement="start"
        control={<Switch checked={Boolean(me.favorite)} onChange={(e) => toggleFavorite(e.target.checked)} />}
        label="Favourite"
        sx={{
          m: 0,
          width: '100%',
          minHeight: 44,
          justifyContent: 'space-between',
          '& .MuiFormControlLabel-label': { fontSize: '0.875rem', color: 'text.secondary' },
        }}
      />
    </Section>
  );
}
