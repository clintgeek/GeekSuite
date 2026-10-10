/**
 * One source (`/sources/:id`): every feed's full health record, the places
 * it covers, and its access (paywall, what the feed carries). Admins get
 * "Check now" (sets the feeds' nextPollAt; the worker picks it up within a
 * minute), a status change and Edit. Everyone else reads.
 */
import React, { useState } from 'react';
import { Box, Button, CircularProgress, Link, MenuItem, TextField, Typography } from '@mui/material';
import { EditOutlined as EditIcon, OpenInNew as OpenIcon, Refresh as CheckIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@apollo/client';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import Column from '../components/Column';
import HealthIndicator from '../components/HealthIndicator';
import KindBadge from '../components/KindBadge';
import PlaceChips from '../components/PlaceChips';
import TimeAgo from '../components/TimeAgo';
import { CHECK_NEWS_SOURCE_NOW, SET_NEWS_SOURCE_STATUS } from '../graphql/mutations';
import { GET_NEWS_SOURCE } from '../graphql/queries';
import { useViewer } from '../hooks/useViewer';
import { GOTHIC, flagSx } from '../theme/theme';
import { hostOf } from '../utils/sources';
import { CONTENT_LABEL, PAYWALL_LABEL, SECTION_LABEL, SOURCE_STATUSES, STATUS_LABEL, labelFor } from '../utils/vocab';
import SourceFormDialog from './SourceFormDialog';

function SectionFlag({ children }) {
  return (
    <Typography component="h2" sx={{ ...flagSx, color: 'text.primary', borderTop: 2, borderColor: 'text.primary', pt: 2, mt: 8, mb: 3 }}>
      {children}
    </Typography>
  );
}

/** A label/value pair in a definition list. */
function Fact({ label, children }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, columnGap: 4, rowGap: 0.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box component="dt" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary' }}>
        {label}
      </Box>
      <Box component="dd" sx={{ m: 0, fontSize: '1rem', color: 'text.primary', minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Box>
    </Box>
  );
}

const never = <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>never</Box>;
const when = (v) => (v ? <TimeAgo value={v} /> : never);

function FeedRecord({ feed }) {
  return (
    <Box component="section" aria-label={`Feed ${hostOf(feed.url)}`} data-testid="feed-record" sx={{ mb: 6 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3, mb: 2 }}>
        <HealthIndicator health={feed.health} sx={{ fontSize: '0.9375rem' }} />
        <Link href={feed.url} target="_blank" rel="noopener noreferrer" sx={{ fontFamily: GOTHIC, fontSize: '0.875rem', color: 'text.primary', overflowWrap: 'anywhere', display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44 }}>
          {feed.url}
        </Link>
      </Box>
      <Box component="dl" sx={{ m: 0 }}>
        <Fact label="Format · interval">{`${feed.format.toUpperCase()} · every ${feed.pollEveryMin} min`}</Fact>
        <Fact label="Last fetch">{when(feed.lastFetchAt)}</Fact>
        <Fact label="Last OK fetch">{when(feed.lastOkAt)}</Fact>
        <Fact label="Newest item">{when(feed.lastItemAt)}</Fact>
        <Fact label="Last new item">{when(feed.lastNewItemAt)}</Fact>
        <Fact label="Failures in a row">{feed.consecutiveFailures}</Fact>
        <Fact label="Last HTTP status">{feed.lastHttpStatus ?? '—'}</Fact>
        <Fact label="Last error">
          {feed.lastError ? (
            <Box component="span" sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.8125rem' }}>
              {feed.lastError}
            </Box>
          ) : (
            '—'
          )}
        </Fact>
      </Box>
    </Box>
  );
}

function AdminActions({ source }) {
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [checkNow, checkState] = useMutation(CHECK_NEWS_SOURCE_NOW, { variables: { id: source.id } });
  const [setStatus, statusState] = useMutation(SET_NEWS_SOURCE_STATUS);

  const onCheck = async () => {
    try {
      await checkNow();
      notify('Queued. The worker polls it within a minute.', { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'Could not queue the check.', { tone: 'error' });
    }
  };

  const onStatus = async (e) => {
    const status = e.target.value;
    try {
      await setStatus({ variables: { id: source.id, status } });
      notify(`Marked ${labelFor(STATUS_LABEL, status).toLowerCase()}.`, { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'Could not change the status.', { tone: 'error' });
    }
  };

  return (
    <Box data-testid="admin-actions" sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', mt: 5 }}>
      <Button variant="contained" disableElevation startIcon={<CheckIcon />} onClick={onCheck} disabled={checkState.loading}>
        {checkState.loading ? 'Queuing…' : 'Check now'}
      </Button>
      <Button variant="outlined" color="inherit" startIcon={<EditIcon />} onClick={() => setEditing(true)}>
        Edit
      </Button>
      <TextField select size="small" label="Status" value={source.status} onChange={onStatus} disabled={statusState.loading} sx={{ minWidth: 160 }}>
        {SOURCE_STATUSES.map((s) => (
          <MenuItem key={s} value={s}>
            {STATUS_LABEL[s]}
          </MenuItem>
        ))}
      </TextField>
      {editing ? <SourceFormDialog open source={source} onClose={() => setEditing(false)} /> : null}
    </Box>
  );
}

export default function SourceDetailView() {
  const { id } = useParams();
  const { isAdmin } = useViewer();
  const { data, loading, error, refetch } = useQuery(GET_NEWS_SOURCE, { variables: { id }, fetchPolicy: 'cache-and-network' });
  const source = data?.newsSource;

  if (loading && !data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 12 }}>
        <CircularProgress size={24} aria-label="Loading source" sx={{ color: 'text.secondary' }} />
      </Box>
    );
  }
  if (error && !data) {
    return (
      <Column>
        <Box role="alert" sx={{ py: 10, textAlign: 'center' }}>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>Couldn’t load this source.</Typography>
          <Button variant="outlined" color="inherit" onClick={() => refetch()}>
            Try again
          </Button>
        </Box>
      </Column>
    );
  }
  if (!source) {
    return (
      <Column>
        <Typography sx={{ py: 10, textAlign: 'center', color: 'text.secondary' }}>
          No such source. <Link component={RouterLink} to="/sources">Back to Sources</Link>
        </Typography>
      </Column>
    );
  }

  return (
    <Column>
      <Box component="header" sx={{ pt: 6, pb: 4, borderBottom: 2, borderColor: 'text.primary' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mb: 2 }}>
          <KindBadge kind={source.kind} />
          <Typography component="span" sx={{ ...flagSx, color: 'text.secondary' }}>
            {labelFor(STATUS_LABEL, source.status)}
          </Typography>
        </Box>
        <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.5rem' } }}>
          {source.name}
        </Typography>
        <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.875rem', color: 'text.secondary', mt: 2 }}>
          {[source.sections.map((s) => labelFor(SECTION_LABEL, s)).join(', '), `${source.articlesLast7d} articles in the last 7 days`].filter(Boolean).join(' · ')}
        </Typography>
        {source.homepage ? (
          <Link href={source.homepage} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 2, fontFamily: GOTHIC, fontSize: '0.875rem', color: 'text.primary' }}>
            {hostOf(source.homepage)}
            <OpenIcon aria-hidden="true" sx={{ fontSize: 14 }} />
          </Link>
        ) : null}
        {isAdmin ? <AdminActions source={source} /> : null}
      </Box>

      <SectionFlag>Feeds</SectionFlag>
      {source.feeds.length ? source.feeds.map((f) => <FeedRecord key={f.id} feed={f} />) : <Typography sx={{ color: 'text.secondary' }}>No feeds.</Typography>}

      <SectionFlag>Covers</SectionFlag>
      {source.places.length ? <PlaceChips places={source.places} /> : <Typography sx={{ color: 'text.secondary' }}>No places set.</Typography>}

      <SectionFlag>Access</SectionFlag>
      <Box component="dl" sx={{ m: 0 }}>
        <Fact label="Paywall">{labelFor(PAYWALL_LABEL, source.access.paywall)}</Fact>
        <Fact label="Feed carries">{labelFor(CONTENT_LABEL, source.access.content)}</Fact>
        <Fact label="Blocked domains">{source.blockedDomains.length ? source.blockedDomains.join(', ') : '—'}</Fact>
      </Box>

      {source.notes ? (
        <>
          <SectionFlag>Notes</SectionFlag>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{source.notes}</Typography>
        </>
      ) : null}
    </Column>
  );
}
