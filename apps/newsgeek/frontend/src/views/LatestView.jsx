/**
 * Latest (`/`): N0's reading view. The masthead, the section flags, then
 * every article newest first from `newsArticles`, paged by `before` with an
 * "Older stories" button — never infinite scroll. The briefing replaces this
 * as the front page in N2.
 *
 * The section lives in the URL (`?section=local`), so back and a reload
 * land on the same page of the paper.
 *
 * "Free to read" (the reader's own pref, newsPrefs/newsSetPrefs): on, the
 * gateway leaves paywalled stories out and says how many. The switch moves at
 * once (optimistic); the cached lists are dropped and the list refetched only
 * AFTER the gateway has stored the new setting (cachePolicies.js).
 */
import React from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { NetworkStatus, useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { useSearchParams } from 'react-router-dom';
import ArticleItem from '../components/ArticleItem';
import Column from '../components/Column';
import FreeToReadSwitch from '../components/FreeToReadSwitch';
import Masthead from '../components/Masthead';
import SectionTabs from '../components/SectionTabs';
import { resetArticleLists } from '../graphql/cachePolicies';
import { SET_NEWS_PREFS } from '../graphql/mutations';
import { GET_NEWS_ARTICLES, GET_NEWS_PREFS } from '../graphql/queries';
import { EMPTY_LINE, articleVariables, hiddenPaywalledLine } from '../utils/articles';
import { GOTHIC } from '../theme/theme';
import { SECTIONS } from '../utils/vocab';

export default function LatestView() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('section');
  const section = SECTIONS.includes(raw) ? raw : 'all';

  const { notify } = useToast();

  const client = useApolloClient();
  const prefsQ = useQuery(GET_NEWS_PREFS, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const freeToRead = Boolean(prefsQ.data?.newsPrefs?.freeToReadOnly);
  const [setPrefs, { loading: savingPrefs }] = useMutation(SET_NEWS_PREFS);

  const { data, error, networkStatus, fetchMore, refetch } = useQuery(GET_NEWS_ARTICLES, {
    variables: articleVariables(section),
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const toggleFreeToRead = async (next) => {
    try {
      await setPrefs({
        variables: { input: { freeToReadOnly: next } },
        optimisticResponse: { newsSetPrefs: { __typename: 'NewsPrefs', freeToReadOnly: next } },
        update(cache, { data: res }) {
          if (res?.newsSetPrefs) cache.writeQuery({ query: GET_NEWS_PREFS, data: { newsPrefs: res.newsSetPrefs } });
        },
      });
      resetArticleLists(client.cache);
      await refetch();
    } catch {
      notify('Couldn’t change Free to read. Try again.', { tone: 'error' });
    }
  };

  const page = data?.newsArticles;
  // The gateway reports 0 unless the switch is on.
  const hiddenLine = hiddenPaywalledLine(page?.hiddenPaywalled);
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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', columnGap: 4, borderBottom: 1, borderColor: 'divider' }}>
        {hiddenLine ? (
          <Typography data-testid="hidden-paywalled" role="status" sx={{ mr: 'auto', fontFamily: GOTHIC, fontStyle: 'italic', fontSize: '0.8125rem', color: 'text.secondary' }}>
            {hiddenLine}
          </Typography>
        ) : null}
        <FreeToReadSwitch checked={freeToRead} onChange={toggleFreeToRead} disabled={!prefsQ.data || savingPrefs} />
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
