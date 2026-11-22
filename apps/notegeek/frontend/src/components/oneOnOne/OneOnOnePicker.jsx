import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, TextField, Typography, useTheme } from '@mui/material';
import { GeekSheet } from '@geeksuite/ui';
import useOneOnOneStore from '../../store/oneOnOneStore';
import { oneOnOnePath, personSlug, sinceLabel } from '../../utils/oneOnOne';
import { useOneOnOnePeople } from './useOneOnOne';
import { graphiteTokens } from '../../theme/tokens';

/**
 * OneOnOnePicker — "New 1:1": who with (DOCS/ONE_ON_ONE_SPEC.md req 1).
 * The people already under the 1:1 tag, longest-unmet first, and a box for
 * someone new. Picking goes straight to a new handwritten page for them.
 * Mounted once (Layout); opened from anywhere through the store.
 */
export default function OneOnOnePicker() {
  const open = useOneOnOneStore((s) => s.open);
  const close = useOneOnOneStore((s) => s.closePicker);
  // The body (and its queries) exists only while the sheet is open.
  return (
    <GeekSheet open={open} onClose={close} title="New 1:1">
      {open ? <PickerBody close={close} /> : null}
    </GeekSheet>
  );
}

function PickerBody({ close }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const { people, loading, error } = useOneOnOnePeople();
  const [name, setName] = useState('');
  const slug = personSlug(name);

  const go = (to) => {
    close();
    navigate(oneOnOnePath(to));
  };

  return (
    <Box data-testid="one-on-one-picker" sx={{ display: 'flex', flexDirection: 'column', gap: '4px', pb: '8px' }}>
      {people.length > 0 ? (
        <Box role="list" aria-label="People" sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {people.map((p) => (
            <Box role="listitem" key={p.slug}>
              <ButtonBase
                data-person={p.slug}
                onClick={() => go(p.slug)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  width: '100%',
                  minHeight: 48,
                  px: '12px',
                  borderRadius: '8px',
                  textAlign: 'left',
                  color: 'text.primary',
                  '&:hover': { bgcolor: g.paper },
                  '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
                }}
              >
                <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{p.name}</Typography>
                <Typography component="span" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{sinceLabel(p.lastMet)}</Typography>
              </ButtonBase>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography sx={{ px: '12px', py: '8px', fontSize: '0.875rem', color: 'text.secondary' }}>
          {loading ? 'Loading…' : error ? 'Could not load your people. You can still type a name.' : 'No one yet. Type a name to start.'}
        </Typography>
      )}
      <Box
        component="form"
        onSubmit={(e) => { e.preventDefault(); if (slug) go(slug); }}
        sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px', px: '12px', pt: '12px' }}
      >
        <TextField
          value={name}
          onChange={(e) => setName(e.target.value)}
          label="Someone new"
          size="small"
          fullWidth
          autoComplete="off"
          inputProps={{ 'data-testid': 'one-on-one-new-name', maxLength: 60 }}
        />
        <Button type="submit" variant="contained" disabled={!slug} data-testid="one-on-one-new-go" sx={{ minHeight: 40, flexShrink: 0 }}>
          Start
        </Button>
      </Box>
    </Box>
  );
}
