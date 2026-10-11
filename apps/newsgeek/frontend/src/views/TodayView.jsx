/**
 * Today (`/`): the front page (plan "Ranking: the briefing"). The masthead,
 * Free to read, then the gateway's sections in its order (Local, State,
 * National, World, Tech): each a section flag, its stories, and "More
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
 */
import React, { useState } from 'react';
import { Box, Button, CircularProgress, Link, Typography } from '@mui/material';
import { NetworkStatus, useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom';
import ArticleItem from '../components/ArticleItem';
import Column from '../components/Column';
import FreeToReadSwitch from '../components/FreeToReadSwitch';
import Masthead from '../components/Masthead';
import SourceSheet from '../components/SourceSheet';
import { useViewer } from '../hooks/useViewer';
import { resetArticleLists } from '../graphql/cachePolicies';
import { SET_NEWS_PREFS } from '../graphql/mutations';
import { GET_NEWS_FRONT_PAGE, GET_NEWS_PREFS } from '../graphql/queries';
import { GOTHIC, SERIF, flagSx } from '../theme/theme';
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
function FrontSection({ section, first, readerLinks, onOpenSource }) {
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
        <ArticleItem key={a.id} article={a} why={a.why ?? []} lead={first && i === 0} headingLevel="h3" readerLinks={readerLinks} onOpenSource={onOpenSource} />
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

  const prefsQ = useQuery(GET_NEWS_PREFS, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first', skip: legacy });
  const freeToRead = Boolean(prefsQ.data?.newsPrefs?.freeToReadOnly);
  const readerLinks = prefsQ.data?.newsPrefs?.readerLinks ?? [];
  const [setPrefs, { loading: savingPrefs }] = useMutation(SET_NEWS_PREFS);

  const { data, error, networkStatus, refetch } = useQuery(GET_NEWS_FRONT_PAGE, {
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
    skip: legacy,
  });

  if (legacy) return <Navigate to={`/everything${location.search}`} replace />;

  const front = data?.newsFrontPage;
  const sections = (front?.sections ?? []).filter((s) => s.items?.length);
  const loadingFirst = !front && networkStatus !== NetworkStatus.error;

  const toggleFreeToRead = async (next) => {
    try {
      await setPrefs({
        variables: { input: { freeToReadOnly: next } },
        optimisticResponse: { newsSetPrefs: { __typename: 'NewsPrefs', freeToReadOnly: next, readerLinks } },
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
      <Masthead edition="Today’s paper" />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', borderBottom: 1, borderColor: 'divider' }}>
        <FreeToReadSwitch checked={freeToRead} onChange={toggleFreeToRead} disabled={!prefsQ.data || savingPrefs} />
      </Box>

      {loadingFirst ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 12 }}>
          <CircularProgress size={24} aria-label="Loading today’s paper" sx={{ color: 'text.secondary' }} />
        </Box>
      ) : null}

      {error && !front ? (
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

      {front && !sections.length ? (
        <Box data-testid="today-empty" sx={{ py: 12, textAlign: 'center' }}>
          <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', maxWidth: 420, mx: 'auto' }}>
            Nothing on the front page yet — the presses are warming up. Sources are polled every 15–60 minutes.
          </Typography>
        </Box>
      ) : null}

      {sections.map((s, i) => (
        <FrontSection key={s.key} section={s} first={i === 0} readerLinks={readerLinks} onOpenSource={openSheet} />
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
