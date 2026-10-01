import React, { useEffect, useMemo, useState } from 'react';
import { Box, ButtonBase, CircularProgress, InputAdornment, TextField, Typography, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@apollo/client';
import { NOTE_TITLES, SEARCH_NOTES } from '../../graphql/queries';
import { foldTargetsFrom, suggestionQuery } from '../../utils/foldIn';
import { graphiteTokens } from '../../theme/tokens';
import TypeIcon from '../notes/TypeIcon';

/**
 * FoldTargetPicker — "which note does this belong in?"
 *
 * Suggestions first: the shared text goes through the same hybrid search the
 * search page uses (keyword + local-embedding meaning, §11 — nothing leaves the
 * box for this), and the best Markdown hit is offered as "Looks like it
 * belongs in: Spiders". Below that, a title search over every note, for when
 * the guess is wrong. Only Markdown notes are offered: Fold-in refuses the
 * rest.
 */
export default function FoldTargetPicker({ text, onPick }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const q = suggestionQuery(text);
  const { data: hits, loading: ranking } = useQuery(SEARCH_NOTES, {
    variables: { q, hybrid: true },
    skip: !q,
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });
  const suggestions = useMemo(() => foldTargetsFrom(hits?.searchNotes, 4), [hits]);

  const [find, setFind] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(find.trim()), 150);
    return () => clearTimeout(t);
  }, [find]);
  const { data: titles, previousData } = useQuery(NOTE_TITLES, {
    variables: { q: debounced || null, limit: 20 },
    skip: !debounced,
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });
  const found = useMemo(() => {
    const low = find.trim().toLowerCase();
    if (!low) return [];
    return ((titles || previousData)?.noteTitles || [])
      .filter((n) => n.type === 'markdown' && n.title && n.title.toLowerCase().includes(low))
      .slice(0, 8);
  }, [titles, previousData, find]);

  const [best, ...others] = suggestions;

  const row = (n, { lead = null, snippet = null } = {}) => (
    <ButtonBase
      key={`${lead || 'row'}-${n.id}`}
      onClick={() => onPick(n)}
      data-fold-target={n.id}
      aria-label={lead ? `${lead} ${n.title}` : n.title}
      sx={{
        width: '100%',
        minHeight: 48,
        justifyContent: 'flex-start',
        textAlign: 'left',
        gap: 1.25,
        px: 1.5,
        py: 1,
        borderRadius: '6px',
        border: `1px solid ${lead ? g.border : g.rule}`,
        bgcolor: g.sheet,
        color: g.ink,
        '&:hover': { bgcolor: g.hlSoft },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <TypeIcon type={n.type || 'markdown'} size={16} aria-hidden role={undefined} aria-label={undefined} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {lead ? <Typography variant="caption" sx={{ color: g.ink2, display: 'block' }}>{lead}</Typography> : null}
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{n.title || 'Untitled'}</Typography>
        {snippet ? (
          <Typography variant="caption" sx={{ color: g.ink2, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {snippet}
          </Typography>
        ) : null}
      </Box>
    </ButtonBase>
  );

  return (
    <Box data-fold-picker sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {ranking && !suggestions.length ? (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: g.ink2 }}>
          <CircularProgress size={14} color="inherit" />
          <Typography variant="caption">Looking for the note this belongs in…</Typography>
        </Box>
      ) : null}
      {best ? row(best, { lead: 'Looks like it belongs in:', snippet: best.snippet }) : null}
      {others.length ? (
        <>
          <Typography variant="caption" sx={{ color: g.ink2, mt: 0.5 }}>Or one of these</Typography>
          {others.map((n) => row(n))}
        </>
      ) : null}
      <TextField
        label="Find a note"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        size="small"
        fullWidth
        sx={{ mt: 1 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
      />
      {find.trim() && debounced && !found.length ? (
        <Typography variant="caption" sx={{ color: g.ink2 }}>No Markdown note has that in its title.</Typography>
      ) : null}
      {found.map((n) => row(n))}
    </Box>
  );
}
