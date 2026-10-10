/**
 * Latest (`/`): N0's reading view. The masthead, the section flags, then
 * every article newest first from `newsArticles`, paged by `before` with an
 * "Older stories" button — never infinite scroll. The briefing replaces this
 * as the front page in N2.
 *
 * The section lives in the URL (`?section=local`), so back and a reload
 * land on the same page of the paper.
 */
import React from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { NetworkStatus, useQuery } from '@apollo/client';
import { useSearchParams } from 'react-router-dom';
import ArticleItem from '../components/ArticleItem';
import Column from '../components/Column';
import Masthead from '../components/Masthead';
import SectionTabs from '../components/SectionTabs';
import { GET_NEWS_ARTICLES } from '../graphql/queries';
import { EMPTY_LINE, articleVariables } from '../utils/articles';
import { SECTIONS } from '../utils/vocab';

export default function LatestView() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('section');
  const section = SECTIONS.includes(raw) ? raw : 'all';

  const { data, error, networkStatus, fetchMore, refetch } = useQuery(GET_NEWS_ARTICLES, {
    variables: articleVariables(section),
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const page = data?.newsArticles;
  const items = page?.items ?? [];
  const loadingFirst = !page && networkStatus !== NetworkStatus.error;
  const loadingMore = networkStatus === NetworkStatus.fetchMore;

  const pickSection = (next) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === 'all') out.delete('section');
      else out.set('section', next);
      return out;
    });
  };

  const older = () => {
    if (!page?.nextBefore) return;
    fetchMore({ variables: articleVariables(section, page.nextBefore) }).catch(() => {});
  };

  return (
    <Column>
      <Masthead />
      <Box sx={{ mt: 2 }}>
        <SectionTabs value={section} onChange={pickSection} />
      </Box>

      {loadingFirst ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 12 }}>
          <CircularProgress size={24} aria-label="Loading stories" sx={{ color: 'text.secondary' }} />
        </Box>
      ) : null}

      {error && !page ? (
        <Box role="alert" sx={{ py: 10, textAlign: 'center' }}>
          <Typography variant="h5" component="p" sx={{ mb: 1 }}>
            The paper didn’t arrive.
          </Typography>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>We couldn’t reach the news desk. Your connection or the gateway may be down.</Typography>
          <Button variant="outlined" color="inherit" onClick={() => refetch()}>
            Try again
          </Button>
        </Box>
      ) : null}

      {page && !items.length ? (
        <Box sx={{ py: 12, textAlign: 'center' }}>
          <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', maxWidth: 420, mx: 'auto' }}>{EMPTY_LINE}</Typography>
        </Box>
      ) : null}

      {items.length ? (
        <Box component="section" aria-label="Stories">
          {items.map((a) => (
            <ArticleItem key={a.id} article={a} />
          ))}
        </Box>
      ) : null}

      {items.length ? (
        <Box sx={{ pt: 6, textAlign: 'center' }}>
          {page?.nextBefore ? (
            <Button variant="outlined" color="inherit" onClick={older} disabled={loadingMore} sx={{ px: 6, borderColor: 'text.primary' }}>
              {loadingMore ? 'Fetching older stories…' : 'Older stories'}
            </Button>
          ) : (
            <Typography sx={{ fontStyle: 'italic', color: 'text.secondary' }}>That’s everything we’ve kept. Older stories age out after 90 days.</Typography>
          )}
        </Box>
      ) : null}
    </Column>
  );
}
