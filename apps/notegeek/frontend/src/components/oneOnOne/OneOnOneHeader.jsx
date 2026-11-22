import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, InputAdornment, TextField, Typography, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { graphiteTokens } from '../../theme/tokens';
import { tagHref } from '../../utils/tagPath';
import { oneOnOnePath, personName, personOfTag, sinceLabel } from '../../utils/oneOnOne';
import { openOneOnOnePicker } from '../../store/oneOnOneStore';
import { useListWidth } from '../notes/ListColumn';
import { useOneOnOnePeople } from './useOneOnOne';
import OpenItems from './OpenItems';

const newButtonSx = { minHeight: 44, flexShrink: 0, borderRadius: '8px', fontWeight: 650 };

/**
 * The 1:1 tag's own page (DOCS/ONE_ON_ONE_SPEC.md req 5): everyone, the one
 * you have gone longest without meeting first.
 */
export function PeopleOverview() {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const listWidth = useListWidth();
  const { people } = useOneOnOnePeople();
  return (
    <Box component="section" aria-label="People" data-testid="one-on-one-people" sx={{ maxWidth: listWidth, mx: 'auto', px: '2px', mb: '12px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', mb: '4px' }}>
        <Typography component="h2" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
          People
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={openOneOnOnePicker} data-testid="one-on-one-new" sx={newButtonSx}>
          New 1:1
        </Button>
      </Box>
      {people.length === 0 ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', py: '8px' }}>No 1:1s yet.</Typography>
      ) : (
        <Box role="list" sx={{ display: 'flex', flexDirection: 'column', border: `1px solid ${theme.palette.divider}`, borderRadius: '8px', overflow: 'hidden' }}>
          {people.map((p, i) => (
            <Box role="listitem" key={p.slug}>
              <ButtonBase
                component={RouterLink}
                to={tagHref(p.tag)}
                data-person={p.slug}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  minHeight: 48,
                  px: '12px',
                  textAlign: 'left',
                  borderTop: i ? `1px solid ${theme.palette.divider}` : 'none',
                  '&:hover': { bgcolor: g.paper },
                  '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: -2 },
                }}
              >
                <Typography component="span" sx={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '0.9375rem', color: 'text.primary' }}>{p.name}</Typography>
                <Typography component="span" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{sinceLabel(p.lastMet)}</Typography>
                <Typography component="span" aria-label={`${p.count} notes`} sx={{ minWidth: 24, textAlign: 'right', fontFamily: theme.typography.fontFamilyMono, fontSize: '0.75rem', color: 'text.secondary' }}>
                  {p.count}
                </Typography>
              </ButtonBase>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * One person's page (req 4): when you last met, what is open, a way to start
 * the next 1:1, and a search of just their notes. The notes follow, below.
 */
export function PersonHeader({ tag, root }) {
  const listWidth = useListWidth();
  const navigate = useNavigate();
  const slug = personOfTag(tag, root);
  const name = personName(slug);
  const { people } = useOneOnOnePeople();
  const person = people.find((p) => p.slug === slug) || null;
  const [q, setQ] = useState('');

  const search = (e) => {
    e.preventDefault();
    const words = q.trim();
    if (words) navigate(`/search?q=${encodeURIComponent(words)}&under=${encodeURIComponent(tag)}`);
  };

  return (
    <Box component="section" aria-label={`1:1s with ${name}`} data-testid="one-on-one-person" sx={{ maxWidth: listWidth, mx: 'auto', px: '2px', mb: '12px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', mb: '8px' }}>
        <Typography data-testid="one-on-one-last" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          {person?.lastMet ? `Last 1:1 ${sinceLabel(person.lastMet)}` : 'No 1:1 yet'}
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(oneOnOnePath(slug))} data-testid="one-on-one-new" sx={newButtonSx}>
          New 1:1
        </Button>
      </Box>
      <OpenItems tag={tag} name={name} />
      <Box component="form" role="search" onSubmit={search}>
        <TextField
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${name}'s notes`}
          size="small"
          fullWidth
          autoComplete="off"
          inputProps={{ 'aria-label': `Search ${name}'s notes`, 'data-testid': 'one-on-one-search', enterKeyHint: 'search' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
      </Box>
    </Box>
  );
}
