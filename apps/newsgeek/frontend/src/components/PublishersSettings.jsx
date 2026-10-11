/**
 * Settings → Publishers (plan "Source sheet"): what the reader set from the
 * Source sheet, in one place to review and undo.
 * - Sources I subscribe to (NewsSource.subscribedByMe): links to each source's
 *   page, where the switch lives.
 * - Publishers I subscribe to and Hidden publishers (domains, for stories that
 *   come through Google News): each with Remove (newsSetPublisherPref).
 * Removing changes what the gateway returns, so the cached story lists are
 * dropped (cachePolicies.js).
 */
import React from 'react';
import { Box, Button, CircularProgress, Link, Typography } from '@mui/material';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { Link as RouterLink } from 'react-router-dom';
import PaywallBadge from './PaywallBadge';
import { resetArticleLists } from '../graphql/cachePolicies';
import { SET_NEWS_PUBLISHER_PREF } from '../graphql/mutations';
import { GET_NEWS_PUBLISHER_PREFS, GET_NEWS_SOURCES } from '../graphql/queries';
import { GOTHIC, flagSx } from '../theme/theme';
import { withoutDomain } from '../utils/publishers';

function SubHead({ id, children }) {
  return (
    <Typography id={id} component="h3" sx={{ ...flagSx, color: 'text.secondary', mt: 5, mb: 1 }}>
      {children}
    </Typography>
  );
}

function Empty({ children, testId }) {
  return (
    <Typography data-testid={testId} sx={{ fontStyle: 'italic', color: 'text.secondary', py: 2 }}>
      {children}
    </Typography>
  );
}

const rowSx = { display: 'flex', alignItems: 'center', gap: 3, minHeight: 48, borderBottom: 1, borderColor: 'divider' };
const nameSx = { flex: 1, minWidth: 0, fontFamily: GOTHIC, fontSize: '0.9375rem', overflowWrap: 'anywhere' };

function DomainList({ id, title, domains, empty, onRemove, removeLabel, testId, busy }) {
  return (
    <Box data-testid={testId}>
      <SubHead id={id}>{title}</SubHead>
      {domains.length ? (
        <Box component="ul" aria-labelledby={id} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {domains.map((d) => (
            <Box component="li" key={d} data-testid="publisher-row" sx={rowSx}>
              <Typography sx={nameSx}>{d}</Typography>
              <Button color="inherit" onClick={() => onRemove(d)} disabled={busy} aria-label={removeLabel(d)} sx={{ minHeight: 44, flexShrink: 0, textDecoration: 'underline', textUnderlineOffset: '0.2em' }}>
                Remove
              </Button>
            </Box>
          ))}
        </Box>
      ) : (
        <Empty testId={`${testId}-empty`}>{empty}</Empty>
      )}
    </Box>
  );
}

export default function PublishersSettings() {
  const client = useApolloClient();
  const { notify } = useToast();
  const prefsQ = useQuery(GET_NEWS_PUBLISHER_PREFS, { fetchPolicy: 'cache-and-network' });
  const sourcesQ = useQuery(GET_NEWS_SOURCES, { fetchPolicy: 'cache-and-network' });
  const [setPref, { loading }] = useMutation(SET_NEWS_PUBLISHER_PREF);
  const prefs = prefsQ.data?.newsPrefs;
  const subscribedSources = (sourcesQ.data?.newsSources ?? []).filter((s) => s.subscribedByMe).sort((a, b) => a.name.localeCompare(b.name));

  const remove = (field, flag) => async (domain) => {
    const next = { ...prefs, [field]: withoutDomain(prefs[field], domain) };
    try {
      await setPref({
        variables: { domain, [flag]: false },
        optimisticResponse: {
          newsSetPublisherPref: {
            __typename: 'NewsPrefs',
            subscribedSourceIds: next.subscribedSourceIds ?? [],
            subscribedDomains: next.subscribedDomains,
            mutedDomains: next.mutedDomains,
          },
        },
        update(cache, { data }) {
          if (data?.newsSetPublisherPref) cache.writeQuery({ query: GET_NEWS_PUBLISHER_PREFS, data: { newsPrefs: data.newsSetPublisherPref } });
        },
      });
      resetArticleLists(client.cache);
    } catch {
      notify(`Couldn’t remove ${domain}. Try again.`, { tone: 'error' });
    }
  };

  return (
    <Box component="section" aria-labelledby="settings-publishers" data-testid="settings-publishers" sx={{ mt: 10 }}>
      <Typography id="settings-publishers" component="h2" sx={{ ...flagSx, color: 'text.primary', borderTop: 2, borderColor: 'text.primary', pt: 2, mb: 2 }}>
        Publishers
      </Typography>
      <Typography sx={{ color: 'text.secondary' }}>Set from a story: tap the publisher’s name above the headline.</Typography>

      <SubHead id="settings-subscribed-sources">Sources I subscribe to</SubHead>
      {sourcesQ.data ? (
        subscribedSources.length ? (
          <Box component="ul" aria-labelledby="settings-subscribed-sources" data-testid="subscribed-sources" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {subscribedSources.map((s) => (
              <Box component="li" key={s.id} sx={rowSx}>
                <Link component={RouterLink} to={`/sources/${encodeURIComponent(s.id)}`} underline="hover" sx={{ ...nameSx, flex: '0 1 auto', color: 'text.primary', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
                  {s.name}
                </Link>
                <PaywallBadge source={s} />
              </Box>
            ))}
          </Box>
        ) : (
          <Empty testId="subscribed-sources-empty">None yet. A source you subscribe to stays in your paper when Free to read is on.</Empty>
        )
      ) : sourcesQ.error ? (
        <Empty>Couldn’t load your sources.</Empty>
      ) : (
        <CircularProgress size={20} aria-label="Loading sources" sx={{ color: 'text.secondary' }} />
      )}

      {prefs ? (
        <>
          <DomainList
            id="settings-subscribed-domains"
            testId="subscribed-domains"
            title="Publishers I subscribe to"
            domains={prefs.subscribedDomains}
            empty="None yet. For stories that come through Google News."
            onRemove={remove('subscribedDomains', 'subscribed')}
            removeLabel={(d) => `Stop subscribing to ${d}`}
            busy={loading}
          />
          <DomainList
            id="settings-hidden-domains"
            testId="hidden-domains"
            title="Hidden publishers"
            domains={prefs.mutedDomains}
            empty="None hidden."
            onRemove={remove('mutedDomains', 'muted')}
            removeLabel={(d) => `Show ${d} again`}
            busy={loading}
          />
        </>
      ) : prefsQ.error ? (
        <Box role="alert" sx={{ mt: 4 }}>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>Couldn’t load your publishers.</Typography>
          <Button variant="outlined" color="inherit" onClick={() => prefsQ.refetch()}>
            Try again
          </Button>
        </Box>
      ) : (
        <Box sx={{ mt: 4 }}>
          <CircularProgress size={20} aria-label="Loading publishers" sx={{ color: 'text.secondary' }} />
        </Box>
      )}
    </Box>
  );
}
