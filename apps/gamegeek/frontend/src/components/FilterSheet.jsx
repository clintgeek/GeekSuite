/**
 * FilterSheet — sort and narrow, one surface. A bottom sheet below md with
 * the "Show N games" action in the thumb zone; a centred dialog above it.
 *
 * Every control writes straight to the URL (through `onPatch`), so the grid
 * behind the sheet updates live and "Show" is just close.
 */
import React from 'react';
import { Box, Button, Divider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { GeekSheet } from '@geeksuite/ui';
import { chipGroupSx } from '../theme/chipStyles';
import { OWNED_OPTIONS, SORT_LABELS, SORT_ORDER } from '../utils/librarySort';
import { platformLabel, sortPlatforms } from '../utils/vocab';

function SectionLabel({ children, id }) {
  return (
    <Typography
      id={id}
      component="h3"
      sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, fontSize: '0.75rem', mb: 1 }}
    >
      {children}
    </Typography>
  );
}


const groupSx = chipGroupSx;

export default function FilterSheet({ open, onClose, total, state, platforms = [], onPatch, onReset }) {
  const platformIds = sortPlatforms(platforms.map((p) => p.shelf));
  const countFor = (id) => platforms.find((p) => p.shelf === id)?.count;

  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h3" component="p">Sort &amp; filter</Typography>
          <Button onClick={onReset} sx={{ color: 'text.secondary' }}>Reset</Button>
        </Box>
      }
      actions={
        <Button variant="contained" fullWidth onClick={onClose}>
          {total == null ? 'Show games' : `Show ${total} ${total === 1 ? 'game' : 'games'}`}
        </Button>
      }
    >
      <Box sx={{ pt: 1, pb: 2 }}>
        <SectionLabel id="sort-by-label">Sort by</SectionLabel>
        <ToggleButtonGroup
          exclusive
          aria-labelledby="sort-by-label"
          value={state.sort}
          onChange={(_e, v) => v && onPatch({ sort: v })}
          sx={groupSx}
        >
          {SORT_ORDER.map((id) => (
            <ToggleButton key={id} value={id}>{SORT_LABELS[id]}</ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Box sx={{ mt: 2.5 }}>
          <SectionLabel id="direction-label">Direction</SectionLabel>
          <ToggleButtonGroup
            exclusive
            aria-labelledby="direction-label"
            value={state.dir}
            onChange={(_e, v) => v && onPatch({ dir: v })}
            sx={groupSx}
          >
            <ToggleButton value="asc">{state.sort === 'title' ? 'A → Z' : 'Lowest / oldest first'}</ToggleButton>
            <ToggleButton value="desc">{state.sort === 'title' ? 'Z → A' : 'Highest / newest first'}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Divider sx={{ my: 2.5 }} />

        <SectionLabel id="platform-label">Platform</SectionLabel>
        {platformIds.length ? (
          <ToggleButtonGroup
            exclusive
            aria-labelledby="platform-label"
            value={state.platform || ''}
            onChange={(_e, v) => v !== null && onPatch({ platform: v })}
            sx={groupSx}
          >
            <ToggleButton value="">Any</ToggleButton>
            {platformIds.map((id) => (
              <ToggleButton key={id} value={id}>
                {platformLabel(id)}
                {countFor(id) ? (
                  <Box component="span" sx={{ ml: 0.75, fontVariantNumeric: 'tabular-nums' }}>{countFor(id)}</Box>
                ) : null}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        ) : (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
            Platforms appear here once a game has a copy recorded.
          </Typography>
        )}

        <Box sx={{ mt: 2.5 }}>
          <SectionLabel id="owned-label">Ownership</SectionLabel>
          <ToggleButtonGroup
            exclusive
            aria-labelledby="owned-label"
            value={state.owned}
            onChange={(_e, v) => v && onPatch({ owned: v })}
            sx={groupSx}
          >
            {OWNED_OPTIONS.map((o) => (
              <ToggleButton key={o.id} value={o.id}>{o.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </Box>
    </GeekSheet>
  );
}
