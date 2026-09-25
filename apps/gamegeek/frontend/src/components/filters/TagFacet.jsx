/**
 * Tags — the one facet big enough to need its own shape (≈70 canonical tags
 * plus the household's own). The most common 12 show first, grouped under the
 * vocabulary's headings (Gameplay, Story & mood, Setting, Look & view, then
 * "Your tags"); "Show all" opens the rest in the same groups; typing searches
 * every tag. A selected tag is always on screen.
 */
import React, { useId, useState } from 'react';
import { Box, IconButton, InputBase, alpha } from '@mui/material';
import { Close as CloseIcon, Search as SearchIcon } from '@mui/icons-material';
import { visibleOptions } from '../../utils/facets';
import { USER_TAG_GROUP, groupTagOptions } from '../../utils/tagGroups';
import { OptionRow, ShowMoreButton } from './FacetOptions';

export default function TagFacet({ options, limit = 12, onChange }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputId = useId();

  if (!options.length) {
    return (
      <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5 }}>
        No tags yet. They arrive with metadata matches, and your own tags show here too.
      </Box>
    );
  }

  const q = query.trim().toLowerCase();
  const pool = q ? options.filter((o) => o.selected || o.label.toLowerCase().includes(q)) : visibleOptions(options, limit, expanded);
  const groups = groupTagOptions(pool);

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
            placeholder={`Search ${options.length} tags`}
            inputProps={{ 'aria-label': 'Search tags', type: 'search' }}
            sx={{
              flex: 1,
              fontSize: { xs: '1rem', md: '0.875rem' },
              '& .MuiInputBase-input': { height: { xs: 44, md: 36 }, py: 0, boxSizing: 'border-box' },
              '& input::placeholder': { color: 'text.secondary', opacity: 1 },
              '& input[type="search"]::-webkit-search-cancel-button': { WebkitAppearance: 'none', display: 'none' },
            }}
          />
          {query ? (
            <IconButton aria-label="Clear tag search" onClick={() => setQuery('')} sx={{ width: 44, height: 44, m: -0.5 }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          ) : null}
        </Box>
      ) : null}

      {groups.length ? (
        groups.map(({ group, options: groupOptions }) => (
          <Box key={group} role="group" aria-label={group === USER_TAG_GROUP ? group : `${group} tags`} sx={{ '& + &': { mt: 1 } }}>
            <Box
              aria-hidden="true"
              sx={{ px: 1, pt: 0.5, pb: 0.25, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}
            >
              {group}
            </Box>
            {groupOptions.map((o) => (
              <OptionRow key={o.value} option={o} onChange={onChange} />
            ))}
          </Box>
        ))
      ) : (
        <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>No tag matches “{query.trim()}”.</Box>
      )}

      {!q && options.length > limit ? (
        <ShowMoreButton expanded={expanded} total={options.length} noun="tags" onClick={() => setExpanded((v) => !v)} />
      ) : null}
    </Box>
  );
}
