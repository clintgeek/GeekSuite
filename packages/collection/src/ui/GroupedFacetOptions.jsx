/**
 * A facet big enough to need its own shape (GameGeek's ~90 tags, a book
 * collection's tags or authors): the most common `limit` show first, grouped
 * under headings the app supplies; "Show all" opens the rest in the same
 * groups; typing searches every value. A selected value is always on screen.
 *
 *   groupOf(value) → group name, groupOrder → the headings in order (the
 *   last one catches anything else), groupLabel(group) → the group's
 *   accessible name, itemNoun → { one: 'tag', many: 'tags' } for the search
 *   box and "Show all 24 tags". Without groupOf the options are one
 *   unlabelled list.
 */
import React, { useId, useState } from 'react';
import { Box, IconButton, InputBase, alpha } from '@mui/material';
import { Close as CloseIcon, Search as SearchIcon } from '@mui/icons-material';
import { groupOptions, visibleOptions } from '../facets/options';
import { OptionRow, ShowMoreButton } from './FacetOptions';

const DEFAULT_NOUN = { one: 'value', many: 'values' };

export default function GroupedFacetOptions({
  options,
  limit = 12,
  onChange,
  groupOf,
  groupOrder = [],
  groupLabel = (g) => g,
  itemNoun = DEFAULT_NOUN,
  emptyText = 'Nothing here yet.',
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputId = useId();

  if (!options.length) {
    return <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5 }}>{emptyText}</Box>;
  }

  const q = query.trim().toLowerCase();
  const pool = q ? options.filter((o) => o.selected || o.label.toLowerCase().includes(q)) : visibleOptions(options, limit, expanded);
  const groups = groupOf && groupOrder.length ? groupOptions(pool, groupOf, groupOrder) : pool.length ? [{ group: null, options: pool }] : [];

  return (
    <Box>
      {options.length > limit ? (
        <Box
          sx={{
            mx: 1,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pl: 1,
            minHeight: { xs: 44, md: 36 },
            borderRadius: '8px',
            border: 1,
            borderColor: 'border',
            bgcolor: 'background.paper',
            '&:focus-within': { borderColor: 'primary.main', boxShadow: (t) => `0 0 0 3px ${alpha(t.palette.primary.main, 0.18)}` },
          }}
        >
          <SearchIcon aria-hidden="true" sx={{ fontSize: 18, color: 'text.secondary' }} />
          <InputBase
            id={inputId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${options.length} ${itemNoun.many}`}
            inputProps={{ 'aria-label': `Search ${itemNoun.many}`, type: 'search' }}
            sx={{
              flex: 1,
              fontSize: { xs: '1rem', md: '0.875rem' },
              '& .MuiInputBase-input': { height: { xs: 44, md: 36 }, py: 0, boxSizing: 'border-box' },
              '& input::placeholder': { color: 'text.secondary', opacity: 1 },
              '& input[type="search"]::-webkit-search-cancel-button': { WebkitAppearance: 'none', display: 'none' },
            }}
          />
          {query ? (
            <IconButton aria-label={`Clear ${itemNoun.one} search`} onClick={() => setQuery('')} sx={{ width: 44, height: 44, m: -0.5 }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          ) : null}
        </Box>
      ) : null}

      {groups.length ? (
        groups.map(({ group, options: groupOptionsList }) => (
          <Box key={group ?? 'all'} role="group" aria-label={group == null ? undefined : groupLabel(group)} sx={{ '& + &': { mt: 1 } }}>
            {group != null ? (
              <Box
                aria-hidden="true"
                sx={{ px: 1, pt: 0.5, pb: 0.25, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}
              >
                {group}
              </Box>
            ) : null}
            {groupOptionsList.map((o) => (
              <OptionRow key={o.value} option={o} onChange={onChange} />
            ))}
          </Box>
        ))
      ) : (
        <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>
          No {itemNoun.one} matches “{query.trim()}”.
        </Box>
      )}

      {!q && options.length > limit ? (
        <ShowMoreButton expanded={expanded} total={options.length} noun={itemNoun.many} onClick={() => setExpanded((v) => !v)} />
      ) : null}
    </Box>
  );
}
