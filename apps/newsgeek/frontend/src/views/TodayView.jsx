/**
 * Today (`/`): the front page (plan "Ranking: the briefing"). The masthead,
 * Free to read, then the gateway's sections in its order (Local, State,
 * National, World, Tech, Around Arkansas): each a section flag, its stories, and "More
 * <section> →" (the section page, newest first) when the cap left some out.
 * Quotas are caps, never targets, so a quiet section is short and an empty
 * one isn't printed. It has an end: "That's today's paper." — no infinite
 * scroll; Everything is one tap away.
 *
 * Every story says why it is here (NewsArticle.why → WhyChips, in place of
 * its place chips). The first story of the first section is the lead, set a
 * size up, the way a paper leads.
 *
 * Old links (`/?source=…`, `/?section=…`, from before Today took `/`) go to
 * Everything with the same query.
 *
 * Free to read and every Source sheet switch change what the gateway returns:
 * after the write, the cached front page and lists are dropped and the page
 * refetched (cachePolicies.resetArticleLists), as on Everything.
 *
 * Coming back (SUITE_REVIEW_2026-11 NewsGeek findings 1, 2): the masthead
 * says when the paper was set ("Updated 8:05 AM", from generatedAt). When the
 * PWA resumes, the reader at the top gets the new paper quietly; one further
 * down gets a "N new stories" bar instead of a page reordered under them
 * (usePaperRefresh). Back to Today reads the front page from the cache once,
 * so the stories under the restored scroll position are the ones they left.
 */
import React, { useCallback, useState } from 'react';
import { Box, CircularProgress, Link, Typography } from '@mui/material';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { GeekLoadError, geekLoadStatus, useToast } from '@geeksuite/ui';
import { Link as RouterLink, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import ArticleItem from '../components/ArticleItem';
import Column from '../components/Column';
import FreeToReadSwitch from '../components/FreeToReadSwitch';
import Masthead from '../components/Masthead';
import NewStoriesBar from '../components/NewStoriesBar';
import { usePaperRefresh } from '../hooks/usePaperRefresh';
import SourceSheet from '../components/SourceSheet';
import { useViewer } from '../hooks/useViewer';
import { resetArticleLists } from '../graphql/cachePolicies';
import { SET_NEWS_PREFS } from '../graphql/mutations';
import { GET_NEWS_FRONT_PAGE, GET_NEWS_PREFS } from '../graphql/queries';
import { GOTHIC, SERIF, flagSx } from '../theme/theme';
import { openingPrefs } from '../utils/openUrl';
import { SECTION_LABEL } from '../utils/vocab';
import AddSourceSheet from './AddSourceSheet';

export const END_LINE = 'That’s today’s paper.';
export const EVERYTHING_LINK = 'Everything, newest first →';

function LookForFeedSheet({ url, onClose }) {
  const { isAdmin } = useViewer();
  return <AddSourceSheet open onClose={onClose} initialUrl={url} autoRun isAdmin={isAdmin} />;
}

const moreSx = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  fontFamily: GOTHIC,
  fontSize: '0.875rem',
  fontWeight: 700,
  color: 'text.primary',
  textDecoration: 'underline',
  textDecorationColor: 'currentColor',
  textUnderlineOffset: '0.25em',
  '&:focus-visible': { outline: '2px solid', outlineOffset: 2 },
};

/** One section of the paper: the flag, its stories, and "More <section> →". */
function FrontSection({ section, first, opening, onOpenSource }) {
  const title = section.title || SECTION_LABEL[section.key] || section.key;
  const headingId = `today-${section.key}`;
  return (
    <Box component="section" aria-labelledby={headingId} data-testid="front-section" data-section={section.key} sx={{ mt: first ? 6 : 10 }}>
      <Box sx={{ borderTop: 3, borderColor: 'text.primary', pt: 1.5, borderBottom: 1, borderBottomColor: 'divider', pb: 1.5 }}>
        <Typography id={headingId} component="h2" sx={{ ...flagSx, fontSize: '0.875rem', letterSpacing: '0.16em', color: 'text.primary' }}>
          {title}
        </Typography>
      </Box>
      {section.items.map((a, i) => (
        <ArticleItem key={a.id} article={a} why={a.why ?? []} lead={first && i === 0} headingLevel="h3" {...opening} onOpenSource={onOpenSource} />
      ))}
      {section.moreCount > 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
          <Link component={RouterLink} to={`/s/${encodeURIComponent(section.key)}`} data-testid="more-link" sx={moreSx}>
            {`More ${title} →`}
          </Link>
        </Box>
      ) : null}
    </Box>
  );
}

export default function TodayView() {
  const location = useLocation();
  const old = new URLSearchParams(location.search);
  const legacy = old.has('source') || old.has('section');

  const [sheetArticle, setSheetArticle] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState(null);
  const { notify } = useToast();
  const client = useApolloClient();
  const navType = useNavigationType();
  // Back (POP) with the paper still cached: show that paper, not a re-ranked one.
  const [firstPolicy] = useState(() => {
    if (navType !== 'POP') return 'cache-and-network';
    try {
      return client.readQuery({ query: GET_NEWS_FRONT_PAGE })?.newsFrontPage ? 'cache-first' : 'cache-and-network';
    } catch {
      return 'cache-and-network';
    }
  });

  const prefsQ = useQuery(GET_NEWS_PREFS, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first', skip: legacy });
  const freeToRead = Boolean(prefsQ.data?.newsPrefs?.freeToReadOnly);
  // How a story opens (plan "Opening"): window mode, open-with links, openers.
  const opening = openingPrefs(prefsQ.data?.newsPrefs);
  const [setPrefs, { loading: savingPrefs }] = useMutation(SET_NEWS_PREFS);

  const { data, error, loading, refetch } = useQuery(GET_NEWS_FRONT_PAGE, {
    notifyOnNetworkStatusChange: true,
    fetchPolicy: firstPolicy,
    nextFetchPolicy: 'cache-first',
    skip: legacy,
  });

  const front = data?.newsFrontPage;
  const sections = (front?.sections ?? []).filter((s) => s.items?.length);
  const status = geekLoadStatus({ loading, error, data: front, isEmpty: (f) => !f });
  const loadingFirst = status === 'loading';

  // Resume (finding 1): the new paper quietly at the top, or a "new stories" bar.
  const peek = useCallback(
    () =>
      client
        .query({ query: GET_NEWS_FRONT_PAGE, fetchPolicy: 'no-cache' })
        .then((r) => (r.data?.newsFrontPage?.sections ?? []).flatMap((s) => (s.items ?? []).map((a) => a.id))),
    [client]
  );
  const { pending, showNew } = usePaperRefresh({
    refetch,
    peek,
    currentIds: sections.flatMap((s) => s.items.map((a) => a.id)),
    enabled: Boolean(front) && !legacy,
  });

  if (legacy) return <Navigate to={`/everything${location.search}`} replace />;

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

  const sheetChanged = () => {
    resetArticleLists(client.cache);
    refetch().catch(() => {});
  };

  const openSheet = (a) => {
    setSheetArticle(a);
    setSheetOpen(true);
  };

  return (
    <Column>
      <NewStoriesBar count={pending?.count} onShow={showNew} />
      <Masthead edition="Today’s paper" updatedAt={front?.generatedAt} />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', borderBottom: 1, borderColor: 'divider' }}>
        <FreeToReadSwitch checked={freeToRead} onChange={toggleFreeToRead} disabled={!prefsQ.data || savingPrefs} />
      </Box>

      {loadingFirst ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 12 }}>
          <CircularProgress size={24} aria-label="Loading today’s paper" sx={{ color: 'text.secondary' }} />
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

      {front && !sections.length ? (
        <Box data-testid="today-empty" sx={{ py: 12, textAlign: 'center' }}>
          <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', maxWidth: 420, mx: 'auto' }}>
            Nothing on the front page yet — the presses are warming up. Sources are polled every 15–60 minutes.
          </Typography>
        </Box>
      ) : null}

      {sections.map((s, i) => (
        <FrontSection key={s.key} section={s} first={i === 0} opening={opening} onOpenSource={openSheet} />
      ))}

      {front ? (
        <Box data-testid="today-end" sx={{ mt: 10, pt: 6, borderTop: 3, borderColor: 'text.primary', textAlign: 'center' }}>
          {sections.length ? (
            <Typography sx={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.125rem', color: 'text.primary' }}>{END_LINE}</Typography>
          ) : null}
          <Link component={RouterLink} to="/everything" sx={{ ...moreSx, fontSize: '0.9375rem' }}>
            {EVERYTHING_LINK}
          </Link>
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
