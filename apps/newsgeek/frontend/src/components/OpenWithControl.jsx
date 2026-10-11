/**
 * "Open stories with" in the Source sheet (plan "Opening", Chef 2026-10-11):
 * how a tap on this publisher's headlines opens — the original link, or one
 * of the reader's open-with links (NewsPrefs.openers, newsSetPublisherOpener).
 *
 * - A direct source is keyed by its id. A story through an aggregator (Google
 *   News) is keyed by its publisher's DOMAIN, so the group says "for <domain>";
 *   when an opener for a parent domain already covers it (reuters.com for
 *   uk.reuters.com) that entry is the one shown and changed.
 * - A vertical radio list, one 48px row per choice: labels run to 40
 *   characters, too long for a segmented row on a phone. Ink on newsprint;
 *   the radio's dot, not a colour, says which one is chosen.
 * - With no open-with links the group is disabled at "Original link" and
 *   offers "Add open-with links in Settings".
 * - The choice moves at once (optimistic); the gateway's answer is the whole
 *   prefs object and replaces the cached prefs, so every visible headline for
 *   this publisher re-resolves its link. A refusal snaps back with a toast.
 *   "Open at publisher" in the ⋯ menu always opens the original.
 */
import React, { useId } from 'react';
import { Box, ButtonBase, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import { ChevronRight as ChevronIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { SET_NEWS_PUBLISHER_OPENER } from '../graphql/mutations';
import { GET_NEWS_PREFS } from '../graphql/queries';
import { GOTHIC, flagSx } from '../theme/theme';
import { findOpener, keyedByDomain } from '../utils/openUrl';

export const ORIGINAL = 'original';
export const ORIGINAL_LABEL = 'Original link (publisher)';
export const OPEN_WITH_HELP = 'Tapping a headline opens it this way. “Open at publisher” in the ⋯ menu always opens the original.';
export const NO_LINKS_LINE = 'Add open-with links in Settings';

const rowSx = {
  m: 0,
  minHeight: 48,
  width: '100%',
  borderBottom: 1,
  borderColor: 'divider',
  gap: 1,
  '& .MuiFormControlLabel-label': { fontFamily: GOTHIC, fontSize: '1rem', fontWeight: 600, color: 'text.primary', overflowWrap: 'anywhere' },
  '& .MuiFormControlLabel-label.Mui-disabled': { color: 'text.secondary' },
};
const radioSx = {
  width: 44,
  height: 44,
  color: 'text.secondary',
  '&.Mui-checked': { color: 'text.primary' },
  '&.Mui-disabled': { color: 'text.secondary' },
  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'text.primary' },
};

/** The opener entries with this publisher's entry replaced (or removed, for the original). */
function nextOpeners(openers, key, linkId) {
  const same = (o) => (key.sourceId ? o.sourceId === key.sourceId : !o.sourceId && o.domain === key.domain);
  const rest = openers.filter((o) => !same(o));
  if (linkId === ORIGINAL) return rest;
  return [...rest, { __typename: 'NewsOpener', sourceId: key.sourceId ?? null, domain: key.sourceId ? null : key.domain, linkId }];
}

export default function OpenWithControl({ article, go, sx }) {
  const { notify } = useToast();
  const headingId = `open-with-${useId().replace(/:/g, '')}`;
  const { data } = useQuery(GET_NEWS_PREFS, { fetchPolicy: 'cache-first' });
  const [setOpener, { loading }] = useMutation(SET_NEWS_PUBLISHER_OPENER);
  const prefs = data?.newsPrefs;
  const byDomain = keyedByDomain(article);
  if (byDomain && !article.publisherDomain) return null;
  if (!prefs) return null;

  const readerLinks = prefs.readerLinks ?? [];
  const openers = prefs.openers ?? [];
  const current = findOpener(article, openers);
  const value = current && readerLinks.some((l) => l.id === current.linkId) ? current.linkId : ORIGINAL;
  const key = byDomain ? { domain: current?.domain || article.publisherDomain } : { sourceId: article.sourceId };
  const none = readerLinks.length === 0;

  const change = async (_, next) => {
    if (!next || next === value) return;
    try {
      await setOpener({
        variables: { ...key, linkId: next === ORIGINAL ? null : next },
        optimisticResponse: { newsSetPublisherOpener: { ...prefs, __typename: 'NewsPrefs', openers: nextOpeners(openers, key, next) } },
        update(cache, { data: res }) {
          if (res?.newsSetPublisherOpener) cache.writeQuery({ query: GET_NEWS_PREFS, data: { newsPrefs: res.newsSetPublisherOpener } });
        },
      });
    } catch (err) {
      notify(err?.graphQLErrors?.[0]?.message || 'Couldn’t change how these stories open. Try again.', { tone: 'error' });
    }
  };

  return (
    <Box data-testid="open-with-control" data-value={value} sx={{ py: 3, ...sx }}>
      <Typography id={headingId} component="p" sx={{ ...flagSx, color: 'text.primary', mb: byDomain ? 0.5 : 1 }}>
        Open stories with
        {byDomain ? (
          <Box component="span" sx={{ display: 'block', ...flagSx, letterSpacing: '0.04em', textTransform: 'none', fontWeight: 600, color: 'text.secondary', mt: 0.5 }}>
            {`for ${key.domain}`}
          </Box>
        ) : null}
      </Typography>
      <RadioGroup value={value} onChange={change} aria-labelledby={headingId} sx={{ borderTop: 1, borderColor: 'divider', mt: 1 }}>
        <FormControlLabel value={ORIGINAL} control={<Radio sx={radioSx} />} label={ORIGINAL_LABEL} disabled={none || loading} sx={rowSx} />
        {readerLinks.map((l) => (
          <FormControlLabel key={l.id} value={l.id} control={<Radio sx={radioSx} />} label={l.label} disabled={loading} sx={rowSx} data-link-id={l.id} />
        ))}
      </RadioGroup>
      {none ? (
        <ButtonBase
          onClick={() => go?.('/settings')}
          data-testid="open-with-add-links"
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
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'text.primary',
            textDecoration: 'underline',
            textUnderlineOffset: '0.2em',
            '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 },
          }}
        >
          <span>{NO_LINKS_LINE}</span>
          <ChevronIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
        </ButtonBase>
      ) : (
        <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', lineHeight: 1.4, color: 'text.secondary', mt: 2 }}>{OPEN_WITH_HELP}</Typography>
      )}
    </Box>
  );
}
