/**
 * LibraryToolbar — one 44px row above the grid:
 *
 *   42 games                     [ Title ↑ ]  [ ⚙ Filter •1 ]  [▦/☰]
 *
 * Sort and Filter open the same FilterSheet (a bottom sheet on a phone, a
 * dialog at md+). The view toggle is ONE button showing where it goes — a
 * second 44px button would push a 360px phone into a sideways scroll.
 * Active narrowing filters and the search render underneath as removable chips.
 */
import React from 'react';
import { Badge, Box, Button, ButtonBase, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon, FilterList as FilterIcon, GridView as GridIcon, ViewList as ListIcon } from '@mui/icons-material';
import { SORT_LABELS } from '../utils/librarySort';
import { platformLabel } from '../utils/vocab';

const pillSx = {
  borderRadius: '999px',
  px: 1.75,
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'text.primary',
  borderColor: 'border',
  whiteSpace: 'nowrap',
};

export default function LibraryToolbar({ total, state, filterCount, onOpenSheet, onPatch, view, onToggleView }) {
  const chips = [];
  if (state.q.trim()) chips.push({ key: 'q', label: `Search: ${state.q.trim()}`, clear: { q: '' } });
  if (state.platform) chips.push({ key: 'platform', label: `On ${platformLabel(state.platform)}`, clear: { platform: '' } });
  if (state.owned === 'true') chips.push({ key: 'owned', label: 'Owned', clear: { owned: 'all' } });
  if (state.owned === 'false') chips.push({ key: 'owned', label: 'Not owned', clear: { owned: 'all' } });

  const sortName = SORT_LABELS[state.sort] || state.sort;
  const arrow = state.dir === 'asc' ? '↑' : '↓';

  return (
    <Box>
      <Box sx={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', minWidth: 0, fontVariantNumeric: 'tabular-nums' }} noWrap>
          {total == null ? ' ' : `${total} ${total === 1 ? 'game' : 'games'}`}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Button
            variant="outlined"
            onClick={() => onOpenSheet('sort')}
            aria-label={`Sort: ${sortName}, ${state.dir === 'asc' ? 'ascending' : 'descending'}`}
            sx={pillSx}
          >
            {sortName} {arrow}
          </Button>
          <Badge
            badgeContent={filterCount}
            color="primary"
            overlap="circular"
            sx={{ '& .MuiBadge-badge': { fontSize: '0.75rem', fontWeight: 700 } }}
          >
            <Button
              variant="outlined"
              onClick={() => onOpenSheet('filter')}
              startIcon={<FilterIcon sx={{ fontSize: 18 }} />}
              aria-label={filterCount ? `Filter, ${filterCount} active` : 'Filter'}
              sx={pillSx}
            >
              Filter
            </Button>
          </Badge>
          <IconButton
              onClick={onToggleView}
              aria-label={view === 'list' ? 'Show as covers' : 'Show as a list'}
              sx={{ width: 44, height: 44, border: 1, borderColor: 'border', borderRadius: '999px' }}
            >
              {view === 'list' ? <GridIcon sx={{ fontSize: 20 }} /> : <ListIcon sx={{ fontSize: 20 }} />}
            </IconButton>
        </Box>
      </Box>

      {chips.length ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
          {chips.map((c) => (
            // The painted pill is 32px; the ButtonBase around it is the 44px target.
            <ButtonBase
              key={c.key}
              onClick={() => onPatch(c.clear)}
              aria-label={`Remove ${c.label}`}
              sx={{ minHeight: 44, borderRadius: '999px', maxWidth: '100%' }}
            >
              <Box
                component="span"
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 32, pl: 1.5, pr: 1,
                  borderRadius: '999px', border: 1, borderColor: 'border', color: 'text.primary',
                  fontSize: '0.75rem', fontWeight: 500, maxWidth: '100%', minWidth: 0,
                }}
              >
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</Box>
                <CloseIcon aria-hidden="true" sx={{ fontSize: 16, color: 'text.secondary' }} />
              </Box>
            </ButtonBase>
          ))}
          <Button
            onClick={() => onPatch({ q: '', platform: '', owned: 'all' })}
            sx={{ fontSize: '0.8125rem', color: 'text.secondary', px: 1.5 }}
          >
            Clear all
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
