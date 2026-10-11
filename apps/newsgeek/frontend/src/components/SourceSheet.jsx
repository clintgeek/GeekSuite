/**
 * The Source sheet (plan "Source sheet", Chef 2026-10-10: "click a source in
 * the newslist and get to settings like marking it paid"). Opened from the
 * publisher line on a story. A bottom sheet on a phone, a dialog from md up
 * (GeekSheet decides, as for "Add a source").
 *
 * Two kinds of story, two sheets:
 * - DIRECT (the source is the publisher): its badges and feed health, then
 *   "In my paper" (newsSetSourceOn), "I subscribe" (newsSetSourceSubscribed,
 *   kept through Free to read), "More from this source" (Latest filtered to
 *   it) and "Source details".
 * - VIA AN AGGREGATOR (Google News): the real publisher and its domain, "via"
 *   the aggregator; "Hide this publisher" and "I subscribe" by domain
 *   (newsSetPublisherPref), "Look for a direct feed" (the Add sheet on
 *   https://<domain>), and "More from <aggregator>".
 *
 * Every switch moves at once (optimistic) and snaps back with a toast if the
 * gateway refuses; after a write `onChanged` lets the list drop its cached
 * pages and refetch, because these prefs change what newsArticles returns.
 */
import React from 'react';
import { Box, Button, ButtonBase, CircularProgress, Typography } from '@mui/material';
import { ChevronRight as ChevronIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@apollo/client';
import { GeekSheet, useToast } from '@geeksuite/ui';
import { useNavigate } from 'react-router-dom';
import HealthIndicator from './HealthIndicator';
import InkSwitch from './InkSwitch';
import KindBadge from './KindBadge';
import PaywallBadge from './PaywallBadge';
import { SET_NEWS_PUBLISHER_PREF, SET_NEWS_SOURCE_ON, SET_NEWS_SOURCE_SUBSCRIBED } from '../graphql/mutations';
import { GET_NEWS_PUBLISHER_PREFS, GET_NEWS_SOURCE } from '../graphql/queries';
import { GOTHIC } from '../theme/theme';
import { worstHealth } from '../utils/health';
import { coveringDomain, withDomain, withoutDomain } from '../utils/publishers';

export const SUBSCRIBE_HELP = 'Keeps it when Free to read is on';
export const HIDE_HELP = 'Its stories leave your paper. Undo here or in Settings.';

const rowLabelSx = { fontFamily: GOTHIC, fontSize: '1rem', fontWeight: 600, letterSpacing: 0, textTransform: 'none', whiteSpace: 'normal' };

/** A full-width row: label left, switch right, an optional line of help under it. */
function SheetSwitch({ label, help, helpStrong = false, checked, onChange, disabled, testId }) {
  return (
    <Box data-testid={testId} sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <InkSwitch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        label={label}
        labelPlacement="start"
        sx={{ width: '100%', justifyContent: 'space-between', minHeight: 48 }}
        labelSx={rowLabelSx}
      />
      {help ? (
        <Typography
          sx={{
            fontFamily: GOTHIC,
            fontSize: '0.8125rem',
            lineHeight: 1.4,
            mt: -2,
            pb: 3,
            pr: 16,
            color: helpStrong ? 'text.primary' : 'text.secondary',
            fontWeight: helpStrong ? 600 : 400,
          }}
        >
          {help}
        </Typography>
      ) : null}
    </Box>
  );
}

/** A full-width row that goes somewhere: label, chevron, 48px tall. */
function SheetLink({ children, onClick, testId }) {
  return (
    <ButtonBase
      onClick={onClick}
      data-testid={testId}
      sx={{
        width: '100%',
        minHeight: 48,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        textAlign: 'left',
        borderBottom: 1,
        borderColor: 'divider',
        fontFamily: GOTHIC,
        fontSize: '1rem',
        fontWeight: 600,
        color: 'text.primary',
        '&:hover': { textDecoration: 'underline', textUnderlineOffset: '0.2em' },
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 },
      }}
    >
      <span>{children}</span>
      <ChevronIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
    </ButtonBase>
  );
}

function Loading({ label }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
      <CircularProgress size={20} aria-label={label} sx={{ color: 'text.secondary' }} />
    </Box>
  );
}

function LoadError({ children, onRetry }) {
  return (
    <Box role="alert" sx={{ py: 6 }}>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>{children}</Typography>
      <Button variant="outlined" color="inherit" onClick={onRetry}>
        Try again
      </Button>
    </Box>
  );
}

const lineSx = { fontFamily: GOTHIC, fontSize: '0.875rem', color: 'text.secondary' };

function DirectBody({ article, onChanged, go }) {
  const { notify } = useToast();
  const { data, error, refetch } = useQuery(GET_NEWS_SOURCE, { variables: { id: article.sourceId }, fetchPolicy: 'cache-and-network' });
  const [setOn, onState] = useMutation(SET_NEWS_SOURCE_ON);
  const [setSubscribed, subState] = useMutation(SET_NEWS_SOURCE_SUBSCRIBED);
  const source = data?.newsSource;

  if (!source) {
    if (error || data) return <LoadError onRetry={() => refetch()}>Couldn’t load this source.</LoadError>;
    return <Loading label="Loading source" />;
  }
  const retired = source.status === 'retired';

  const toggleOn = async (on) => {
    try {
      await setOn({
        variables: { id: source.id, on },
        optimisticResponse: { newsSetSourceOn: { __typename: 'NewsSource', id: source.id, onForMe: on, defaultOn: Boolean(source.defaultOn) } },
      });
      onChanged?.();
    } catch {
      notify(`Couldn’t turn ${source.name} ${on ? 'on' : 'off'}. Try again.`, { tone: 'error' });
    }
  };

  const toggleSubscribed = async (on) => {
    try {
      await setSubscribed({
        variables: { id: source.id, on },
        optimisticResponse: { newsSetSourceSubscribed: { __typename: 'NewsSource', id: source.id, subscribedByMe: on } },
      });
      onChanged?.();
    } catch {
      notify('Couldn’t change your subscription. Try again.', { tone: 'error' });
    }
  };

  return (
    <Box data-testid="source-sheet-direct">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <KindBadge kind={source.kind} />
        <PaywallBadge source={source} />
      </Box>
      <Box data-testid="source-sheet-health" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1, mb: 3 }}>
        <HealthIndicator health={worstHealth(source.feeds)} />
        <Typography component="span" sx={lineSx}>
          {`${source.articlesLast7d} ${source.articlesLast7d === 1 ? 'story' : 'stories'} this week`}
        </Typography>
      </Box>
      <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
        <SheetSwitch
          testId="sheet-in-my-paper"
          label="In my paper"
          help={retired ? 'Retired: nobody’s paper polls it now.' : null}
          checked={source.onForMe}
          onChange={toggleOn}
          disabled={retired || onState.loading}
        />
        <SheetSwitch
          testId="sheet-subscribe"
          label="I subscribe"
          help={SUBSCRIBE_HELP}
          helpStrong={source.paywalled}
          checked={source.subscribedByMe}
          onChange={toggleSubscribed}
          disabled={(retired && !source.subscribedByMe) || subState.loading}
        />
        <SheetLink testId="sheet-more-from" onClick={() => go(`/?source=${encodeURIComponent(source.id)}`)}>
          More from this source
        </SheetLink>
        <SheetLink testId="sheet-details" onClick={() => go(`/sources/${encodeURIComponent(source.id)}`)}>
          Source details
        </SheetLink>
      </Box>
    </Box>
  );
}

function PublisherBody({ article, onChanged, onLookForFeed, go }) {
  const { notify } = useToast();
  const domain = article.publisherDomain;
  const { data, error, refetch } = useQuery(GET_NEWS_PUBLISHER_PREFS, { fetchPolicy: 'cache-and-network', skip: !domain });
  const [setPref, prefState] = useMutation(SET_NEWS_PUBLISHER_PREF);
  const prefs = data?.newsPrefs;
  const moreFrom = (
    <SheetLink testId="sheet-more-from" onClick={() => go(`/?source=${encodeURIComponent(article.sourceId)}`)}>
      {`More from ${article.sourceName}`}
    </SheetLink>
  );

  if (!domain) {
    return (
      <Box data-testid="source-sheet-aggregator">
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          {article.sourceName} didn’t say which site this came from, so it can’t be hidden or kept by name.
        </Typography>
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>{moreFrom}</Box>
      </Box>
    );
  }
  if (!prefs) {
    if (error) return <LoadError onRetry={() => refetch()}>Couldn’t load your settings.</LoadError>;
    return <Loading label="Loading your settings" />;
  }

  const subscribedBy = coveringDomain(prefs.subscribedDomains, domain);
  const mutedBy = coveringDomain(prefs.mutedDomains, domain);

  // Turning on writes this domain; turning off removes the entry that covers
  // it (subscribing to nwaonline.com covers obits.nwaonline.com).
  const change = async (field, flag, on) => {
    const target = on ? domain : (field === 'subscribedDomains' ? subscribedBy : mutedBy) || domain;
    const next = { ...prefs, [field]: on ? withDomain(prefs[field], target) : withoutDomain(prefs[field], target) };
    try {
      await setPref({
        variables: { domain: target, [flag]: on },
        optimisticResponse: {
          newsSetPublisherPref: {
            __typename: 'NewsPrefs',
            subscribedSourceIds: next.subscribedSourceIds ?? [],
            subscribedDomains: next.subscribedDomains,
            mutedDomains: next.mutedDomains,
          },
        },
        update(cache, { data: res }) {
          if (res?.newsSetPublisherPref) cache.writeQuery({ query: GET_NEWS_PUBLISHER_PREFS, data: { newsPrefs: res.newsSetPublisherPref } });
        },
      });
      onChanged?.();
    } catch (err) {
      notify(err?.graphQLErrors?.[0]?.message || 'Couldn’t save that. Try again.', { tone: 'error' });
    }
  };

  return (
    <Box data-testid="source-sheet-aggregator">
      <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
        <SheetSwitch
          testId="sheet-hide-publisher"
          label="Hide this publisher"
          help={HIDE_HELP}
          checked={Boolean(mutedBy)}
          onChange={(on) => change('mutedDomains', 'muted', on)}
          disabled={prefState.loading}
        />
        <SheetSwitch
          testId="sheet-subscribe"
          label="I subscribe"
          help={SUBSCRIBE_HELP}
          checked={Boolean(subscribedBy)}
          onChange={(on) => change('subscribedDomains', 'subscribed', on)}
          disabled={prefState.loading}
        />
        <SheetLink testId="sheet-look-for-feed" onClick={() => onLookForFeed?.(`https://${domain}`)}>
          Look for a direct feed
        </SheetLink>
        {moreFrom}
      </Box>
    </Box>
  );
}

export default function SourceSheet({ article, open, onClose, onChanged, onLookForFeed }) {
  const navigate = useNavigate();
  if (!article) return null;
  const via = Boolean(article.viaAggregator);
  const go = (to) => {
    onClose?.();
    navigate(to);
  };
  const title = via ? article.publisher || article.publisherDomain || article.sourceName : article.sourceName || article.publisher;
  const description = via ? [article.publisherDomain, `via ${article.sourceName}`].filter(Boolean).join(' · ') : undefined;
  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      bodySx={{ px: { xs: 4, sm: 6 }, pb: 6 }}
      headerSx={{ pl: { xs: 4, sm: 6 } }}
    >
      <Box data-testid="source-sheet" data-variant={via ? 'aggregator' : 'direct'} sx={{ pt: 1 }}>
        {via ? (
          <PublisherBody article={article} onChanged={onChanged} onLookForFeed={onLookForFeed} go={go} />
        ) : (
          <DirectBody article={article} onChanged={onChanged} go={go} />
        )}
      </Box>
    </GeekSheet>
  );
}
