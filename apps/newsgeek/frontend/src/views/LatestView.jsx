/**
 * Everything (`/everything`) and a section page (`/s/:section`): every story
 * newest first from `newsArticles`, paged by the gateway's compound
 * `cursor` with an "Older stories" button — never infinite scroll. Today (`/`) is the ranked front
 * page; this is the archive behind it (N0's Latest, moved 2026-10-11).
 *
 * Everything: the masthead, then the section flags. The section lives in the
 * URL (`?section=local`), so back and a reload land on the same page.
 * A section page (`fixedSection`, from Today's "More <section> →"): a section
 * heading instead of the masthead and no flags. Sections are per reader and
 * per story (NewsArticle.section): the gateway files each story.
 *
 * "Free to read" (the reader's own pref, newsPrefs/newsSetPrefs): on, the
 * gateway leaves paywalled stories out and says how many. The switch moves at
 * once (optimistic); the cached lists are dropped and the list refetched only
 * AFTER the gateway has stored the new setting (cachePolicies.js).
 *
 * The publisher line on each story opens the Source sheet (plan "Source
 * sheet"). Its switches change what the gateway returns, so after each one
 * the cached lists are dropped and the list refetched, as for Free to read.
 * "More from…" lands here as `/everything?source=<id>`: the list is that source only,
 * a "Showing: <name> ×" chip says so, and the section flags are put away
 * until the chip is dismissed (a source has fixed sections, so most flags
 * would only show an empty page). "Look for a direct feed" opens the Add a
 * source sheet on https://<domain> and looks at once.
 *
 * Coming back (SUITE_REVIEW_2026-11 NewsGeek findings 1, 2, 4):
 *  - the PWA resumed: at the top the list refreshes quietly; further down a
 *    "N new stories" bar waits instead (usePaperRefresh);
 *  - Back to this page: the list "Older stories" grew is kept (read from the
 *    cache once instead of refetching page one over it) or, after a reload,
 *    asked for again at its old length; AppMain puts the reader back;
 *  - an "Older stories" failure is said, with Try again.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { NetworkStatus, useApolloClient, useMutation, useQuery } from '@apollo/client';
import { GeekLoadError, geekLoadStatus, useToast } from '@geeksuite/ui';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import ArticleItem from '../components/ArticleItem';
import Column from '../components/Column';
import FreeToReadSwitch from '../components/FreeToReadSwitch';
import Masthead from '../components/Masthead';
import NewStoriesBar from '../components/NewStoriesBar';
import SectionTabs from '../components/SectionTabs';
import SourceSheet from '../components/SourceSheet';
import { useViewer } from '../hooks/useViewer';
import { usePaperRefresh } from '../hooks/usePaperRefresh';
import { placeKey, readCount, writeCount } from '../hooks/scrollMemory';
import { resetArticleLists } from '../graphql/cachePolicies';
import { SET_NEWS_PREFS } from '../graphql/mutations';
import { GET_NEWS_ARTICLES, GET_NEWS_PREFS, GET_NEWS_SOURCE } from '../graphql/queries';
import { EMPTY_LINE, articleVariables, firstPageLimit, hiddenPaywalledLine } from '../utils/articles';
import { GOTHIC, flagSx } from '../theme/theme';
import { openingPrefs } from '../utils/openUrl';
import { SECTIONS, SECTION_LABEL } from '../utils/vocab';
import AddSourceSheet from './AddSourceSheet';

/** "Look for a direct feed": the Add sheet, already looking. Its own component so Latest asks newsViewer only then. */
function LookForFeedSheet({ url, onClose }) {
  const { isAdmin } = useViewer();
  return <AddSourceSheet open onClose={onClose} initialUrl={url} autoRun isAdmin={isAdmin} />;
}

export const OLDER_FAILED_LINE = 'Couldn’t fetch older stories.';

/**
 * How the first page is fetched. A new visit: cache and network, as always.
 * Back (POP) to a list still in the cache: the cache alone, once — a network
 * refetch of page one would replace the list "Older stories" grew and the
 * reader's place with it (the resume refresh keeps it current later). Back
 * after a reload (no cache): as many stories as the reader had.
 */
function firstFetch(client, { pop, key, section, sourceId }) {
  const vars = articleVariables(section, null, sourceId);
  if (!pop) return { variables: vars, fetchPolicy: 'cache-and-network' };
  let cached = null;
  try {
    cached = client.readQuery({ query: GET_NEWS_ARTICLES, variables: vars });
  } catch {
    cached = null;
  }
  if (cached?.newsArticles) return { variables: vars, fetchPolicy: 'cache-first' };
  return { variables: articleVariables(section, null, sourceId, firstPageLimit(readCount(key))), fetchPolicy: 'cache-and-network' };
}

/** A section page's heading: the section's name set big, and what the list is. */
function SectionHeader({ section }) {
  const label = SECTION_LABEL[section];
  return (
    <Box component="header" data-testid="section-header" sx={{ pt: 6, pb: 3, borderBottom: 2, borderColor: 'text.primary' }}>
      <Typography component="p" sx={{ ...flagSx, color: 'text.secondary', mb: 1 }}>
        Section
      </Typography>
      <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '2.25rem', sm: '2.75rem' } }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.875rem', color: 'text.secondary', mt: 2 }}>
        {section === 'around' ? 'Other Arkansas towns’ papers on their own towns, newest first.' : `Every ${label} story in your paper, newest first.`}
      </Typography>
    </Box>
  );
}

export default function LatestView({ fixedSection = null }) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('section');
  const section = fixedSection || (SECTIONS.includes(raw) ? raw : 'all');
  const sourceId = fixedSection ? null : params.get('source') || null;
  const [sheetArticle, setSheetArticle] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState(null);

  const { notify } = useToast();
  const location = useLocation();
  const navType = useNavigationType();
  const key = placeKey(location);
  const listKey = `${section}|${sourceId || ''}`;

  const client = useApolloClient();
  // Decided once per list: the list this page opened on may come back from
  // the cache (Back); any other list (a tab, the source chip) is fetched as usual.
  const [opened] = useState(() => ({ listKey, ...firstFetch(client, { pop: navType === 'POP', key, section, sourceId }) }));
  const fetchPlan =
    opened.listKey === listKey ? opened : { variables: articleVariables(section, null, sourceId), fetchPolicy: 'cache-and-network' };
  const [olderFailed, setOlderFailed] = useState(false);
  const prefsQ = useQuery(GET_NEWS_PREFS, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const freeToRead = Boolean(prefsQ.data?.newsPrefs?.freeToReadOnly);
  // How a story opens (plan "Opening"): window mode, open-with links, openers.
  const opening = openingPrefs(prefsQ.data?.newsPrefs);
  const [setPrefs, { loading: savingPrefs }] = useMutation(SET_NEWS_PREFS);

  const { data, error, networkStatus, fetchMore, refetch, loading } = useQuery(GET_NEWS_ARTICLES, {
    variables: fetchPlan.variables,
    notifyOnNetworkStatusChange: true,
    fetchPolicy: fetchPlan.fetchPolicy,
    nextFetchPolicy: 'cache-first',
  });

  // The filter chip's name; a story on the page already carries it.
  const sourceQ = useQuery(GET_NEWS_SOURCE, { variables: { id: sourceId }, skip: !sourceId, fetchPolicy: 'cache-first' });

  const toggleFreeToRead = async (next) => {
    try {
      await setPrefs({
        variables: { input: { freeToReadOnly: next } },
        optimisticResponse: { newsSetPrefs: { __typename: 'NewsPrefs', ...prefsQ.data?.newsPrefs, freeToReadOnly: next } },
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
  const status = geekLoadStatus({ loading, error, data: page, isEmpty: (p) => !p });
  const loadingFirst = status === 'loading';
  const loadingMore = networkStatus === NetworkStatus.fetchMore;

  // How long the list is, for Back after a reload (scrollMemory).
  useEffect(() => {
    if (items.length) writeCount(key, items.length);
  }, [key, items.length]);

  // Resume (finding 1): page one again, quietly at the top, or a "new stories" bar.
  const peek = useCallback(
    () =>
      client
        .query({ query: GET_NEWS_ARTICLES, variables: articleVariables(section, null, sourceId), fetchPolicy: 'no-cache' })
        .then((r) => r.data?.newsArticles?.items?.map((a) => a.id) ?? null),
    [client, section, sourceId]
  );
  const refresh = useCallback(() => refetch(articleVariables(section, null, sourceId)), [refetch, section, sourceId]);
  const { pending, showNew } = usePaperRefresh({ refetch: refresh, peek, currentIds: items.map((a) => a.id), enabled: Boolean(page) });

  const filterName = sourceId ? sourceQ.data?.newsSource?.name || items.find((a) => a.sourceId === sourceId)?.sourceName || 'one source' : null;

  const clearSource = () => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      out.delete('source');
      return out;
    });
  };

  // A Source sheet switch changed what the gateway returns.
  const sheetChanged = () => {
    resetArticleLists(client.cache);
    refetch().catch(() => {});
  };

  const openSheet = (a) => {
    setSheetArticle(a);
    setSheetOpen(true);
  };

  const pickSection = (next) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === 'all') out.delete('section');
      else out.set('section', next);
      return out;
    });
  };

  // An "Older stories" failure is said, with Try again (finding 4) — never swallowed.
  const older = () => {
    if (!page?.nextCursor) return undefined;
    setOlderFailed(false);
    return fetchMore({ variables: articleVariables(section, page.nextCursor, sourceId) }).catch(() => setOlderFailed(true));
  };

  return (
    <Column>
      <NewStoriesBar count={pending?.count} onShow={showNew} />
      {fixedSection ? <SectionHeader section={fixedSection} /> : <Masthead edition="Everything, newest first" />}
      {fixedSection ? null : sourceId ? (
        <Box data-testid="source-filter" sx={{ mt: 3, mb: 1 }}>
          <Box
            sx={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%', minHeight: 48, pl: 4, border: 2, borderColor: 'text.primary', borderRadius: '24px' }}
          >
            <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.875rem', fontWeight: 700, color: 'text.primary', minWidth: 0, overflowWrap: 'anywhere' }}>
              {`Showing: ${filterName}`}
            </Typography>
            <IconButton aria-label={`Show every source, not just ${filterName}`} onClick={clearSource} sx={{ width: 44, height: 44, flexShrink: 0, color: 'text.primary' }}>
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <SectionTabs value={section} onChange={pickSection} />
        </Box>
      )}
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

      {status === 'error' ? (
        <GeekLoadError
          data-testid="paper-error"
          title="The paper didn’t arrive."
          description="We couldn’t reach the news desk. Your connection or the gateway may be down."
          error={error}
          showDetail={false}
          retryLabel="Try again"
          onRetry={() => refetch().catch(() => {})}
          sx={{ py: 10 }}
        />
      ) : null}

      {page && !items.length ? (
        <Box sx={{ py: 12, textAlign: 'center' }}>
          <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', maxWidth: 420, mx: 'auto' }}>
            {sourceId ? `Nothing from ${filterName} in your paper right now.` : fixedSection ? `No ${SECTION_LABEL[fixedSection]} stories in your paper right now.` : EMPTY_LINE}
          </Typography>
        </Box>
      ) : null}

      {items.length ? (
        <Box component="section" aria-label="Stories">
          {items.map((a) => (
            <ArticleItem key={a.id} article={a} {...opening} onOpenSource={openSheet} />
          ))}
        </Box>
      ) : null}

      {items.length ? (
        <Box sx={{ pt: 6, textAlign: 'center' }}>
          {page?.nextCursor ? (
            <>
              {olderFailed ? (
                <Typography role="alert" data-testid="older-failed" sx={{ fontStyle: 'italic', color: 'text.primary', mb: 3 }}>
                  {OLDER_FAILED_LINE}
                </Typography>
              ) : null}
              <Button variant="outlined" color="inherit" onClick={older} disabled={loadingMore} sx={{ px: 6, minHeight: 44, borderColor: 'text.primary' }}>
                {loadingMore ? 'Fetching older stories…' : olderFailed ? 'Try again' : 'Older stories'}
              </Button>
            </>
          ) : (
            <Typography sx={{ fontStyle: 'italic', color: 'text.secondary' }}>That’s everything we’ve kept. Older stories age out after 90 days.</Typography>
          )}
        </Box>
      ) : null}

      <SourceSheet
        article={sheetArticle}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onChanged={sheetChanged}
        onLookForFeed={(url) => {
          setSheetOpen(false);
          setFeedUrl(url);
        }}
      />
      {feedUrl ? <LookForFeedSheet key={feedUrl} url={feedUrl} onClose={() => setFeedUrl(null)} /> : null}
    </Column>
  );
}
