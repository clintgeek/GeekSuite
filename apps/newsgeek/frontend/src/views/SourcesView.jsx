/**
 * Sources (`/sources`): every source, its kind, sections and status, and
 * each feed's health — so a feed never dies quietly (DOCS/NEWSGEEK_PLAN.md
 * "Ingest"). A summary line on top, a status filter, and for admins "Add
 * source". Everyone else reads; the gateway enforces the same rule.
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Link, Typography } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useQuery } from '@apollo/client';
import { Link as RouterLink } from 'react-router-dom';
import Column from '../components/Column';
import HealthIndicator from '../components/HealthIndicator';
import KindBadge from '../components/KindBadge';
import TimeAgo from '../components/TimeAgo';
import { GET_NEWS_SOURCES } from '../graphql/queries';
import { useViewer } from '../hooks/useViewer';
import { GOTHIC, flagSx } from '../theme/theme';
import { hostOf, matchesFilter, sourceSummary } from '../utils/sources';
import { SECTION_LABEL, SOURCE_STATUSES, STATUS_LABEL, labelFor } from '../utils/vocab';
import SourceFormDialog from './SourceFormDialog';

const FILTERS = [{ id: 'all', label: 'All' }, { id: 'attention', label: 'Needs attention' }, ...SOURCE_STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s] }))];

function FeedLine({ feed }) {
  return (
    <Box component="li" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 3, rowGap: 0.5, py: 1 }}>
      <HealthIndicator health={feed.health} />
      <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary', minWidth: 0, overflowWrap: 'anywhere' }}>
        {hostOf(feed.url)}
      </Typography>
      <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>
        {feed.lastOkAt ? <TimeAgo value={feed.lastOkAt} prefix="last OK " /> : 'no good fetch yet'}
      </Typography>
    </Box>
  );
}

function SourceRow({ source }) {
  return (
    <Box component="li" data-testid="source-row" sx={{ py: 4, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1, mb: 1 }}>
        <Typography variant="h5" component="h2" sx={{ mr: 'auto', minWidth: 0 }}>
          <Link component={RouterLink} to={`/sources/${encodeURIComponent(source.id)}`} underline="hover" sx={{ color: 'text.primary', display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44 }}>
            {source.name}
          </Link>
        </Typography>
        <KindBadge kind={source.kind} />
      </Box>
      <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>
        {[labelFor(STATUS_LABEL, source.status), source.sections.map((s) => labelFor(SECTION_LABEL, s)).join(', '), `${source.articlesLast7d} this week`]
          .filter(Boolean)
          .join(' · ')}
      </Typography>
      <Box component="ul" aria-label={`${source.name} feeds`} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {source.feeds.map((f) => (
          <FeedLine key={f.id} feed={f} />
        ))}
      </Box>
    </Box>
  );
}

export default function SourcesView() {
  const { isAdmin } = useViewer();
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const { data, loading, error, refetch } = useQuery(GET_NEWS_SOURCES, { fetchPolicy: 'cache-and-network' });
  const sources = useMemo(() => data?.newsSources ?? [], [data]);
  const shown = useMemo(
    () => sources.filter((s) => matchesFilter(s, filter)).sort((a, b) => a.name.localeCompare(b.name)),
    [sources, filter]
  );
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, sources.filter((s) => matchesFilter(s, f.id)).length])), [sources]);

  return (
    <Column>
      <Box component="header" sx={{ pt: 6, pb: 3, borderBottom: 2, borderColor: 'text.primary', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 3 }}>
        <Box sx={{ mr: 'auto' }}>
          <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.5rem' } }}>
            Sources
          </Typography>
          <Typography data-testid="sources-summary" sx={{ ...flagSx, color: 'text.secondary', mt: 1 }}>
            {data ? sourceSummary(sources) : ' '}
          </Typography>
        </Box>
        {isAdmin ? (
          <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            Add source
          </Button>
        ) : null}
      </Box>

      <Box role="group" aria-label="Filter by status" sx={{ display: 'flex', gap: 2, overflowX: 'auto', py: 3, mx: { xs: -4, sm: 0 }, px: { xs: 4, sm: 0 } }}>
        {FILTERS.filter((f) => f.id === 'all' || counts[f.id]).map((f) => {
          const selected = filter === f.id;
          return (
            <Chip
              key={f.id}
              label={`${f.label} ${counts[f.id] ?? 0}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={selected}
              variant="outlined"
              sx={{
                fontWeight: selected ? 700 : 500,
                height: 44,
                color: 'text.primary',
                borderColor: selected ? 'text.primary' : 'divider',
                borderWidth: selected ? 2 : 1,
                bgcolor: 'transparent',
              }}
            />
          );
        })}
      </Box>

      {loading && !data ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
          <CircularProgress size={24} aria-label="Loading sources" sx={{ color: 'text.secondary' }} />
        </Box>
      ) : null}
      {error && !data ? (
        <Box role="alert" sx={{ py: 8, textAlign: 'center' }}>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>Couldn’t load the sources.</Typography>
          <Button variant="outlined" color="inherit" onClick={() => refetch()}>
            Try again
          </Button>
        </Box>
      ) : null}
      {data && !shown.length ? (
        <Typography sx={{ py: 10, textAlign: 'center', fontStyle: 'italic', color: 'text.secondary' }}>
          {sources.length ? 'No sources match this filter.' : 'No sources yet.'}
        </Typography>
      ) : null}

      <Box component="ul" aria-label="Sources" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {shown.map((s) => (
          <SourceRow key={s.id} source={s} />
        ))}
      </Box>

      {adding ? <SourceFormDialog open onClose={() => setAdding(false)} /> : null}
    </Column>
  );
}
