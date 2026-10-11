/**
 * Settings → Home places (plan "Ranking: the briefing"): the reader's ring,
 * closest first (NewsPrefs.homePlaces, max 12). A story tagged with one of
 * these places — or a place inside one (Gurdon is inside Clark County) — is
 * Local on Today, and the closer the place sits to the top, the higher it
 * ranks.
 *
 * Phone first: order is changed with 44px Move up / Move down buttons, never
 * by drag alone. Every change saves at once (newsSetHomePlaces with the whole
 * ordered list) and shows at once (optimistic); a refusal snaps it back with
 * a toast. A save changes Today, so the cached front page and lists are
 * dropped (cachePolicies.resetArticleLists).
 */
import React, { useState } from 'react';
import { Autocomplete, Box, Button, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import { ArrowDownward as DownIcon, ArrowUpward as UpIcon, Close as RemoveIcon } from '@mui/icons-material';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { resetArticleLists } from '../graphql/cachePolicies';
import { SET_NEWS_HOME_PLACES } from '../graphql/mutations';
import { GET_NEWS_HOME_PLACES, GET_NEWS_PLACES } from '../graphql/queries';
import { GOTHIC, flagSx } from '../theme/theme';
import { labelFor } from '../utils/vocab';

export const HOME_PLACES_MAX = 12;
export const HOME_PLACES_HELP = 'Stories tagged with these places are Local, closest first.';

const KIND_LABEL = { town: 'Town', city: 'Town', county: 'County', region: 'Region', state: 'State', country: 'Country' };

const iconSx = { width: 44, height: 44, flexShrink: 0, color: 'text.primary', '&.Mui-disabled': { color: 'text.secondary', opacity: 0.5 } };

export default function HomePlacesSettings() {
  const { notify } = useToast();
  const client = useApolloClient();
  const homeQ = useQuery(GET_NEWS_HOME_PLACES, { fetchPolicy: 'cache-and-network' });
  const placesQ = useQuery(GET_NEWS_PLACES, { fetchPolicy: 'cache-first' });
  const [setHomePlaces, { loading: saving }] = useMutation(SET_NEWS_HOME_PLACES);
  const [input, setInput] = useState('');

  const ring = homeQ.data?.newsPrefs?.homePlaces;
  const all = placesQ.data?.newsPlaces ?? [];

  const save = async (next) => {
    try {
      await setHomePlaces({
        variables: { placeIds: next.map((p) => p.id) },
        optimisticResponse: { newsSetHomePlaces: { __typename: 'NewsPrefs', homePlaces: next } },
        update(cache, { data }) {
          if (data?.newsSetHomePlaces) cache.writeQuery({ query: GET_NEWS_HOME_PLACES, data: { newsPrefs: data.newsSetHomePlaces } });
        },
      });
      resetArticleLists(client.cache);
    } catch (err) {
      notify(err?.graphQLErrors?.[0]?.message || 'Couldn’t save your home places. Try again.', { tone: 'error' });
    }
  };

  const move = (i, by) => {
    const next = [...ring];
    const [p] = next.splice(i, 1);
    next.splice(i + by, 0, p);
    save(next);
  };

  let body;
  if (!ring) {
    body = homeQ.error ? (
      <Box role="alert">
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>Couldn’t load your home places.</Typography>
        <Button variant="outlined" color="inherit" onClick={() => homeQ.refetch()}>
          Try again
        </Button>
      </Box>
    ) : (
      <CircularProgress size={20} aria-label="Loading home places" sx={{ color: 'text.secondary' }} />
    );
  } else {
    const inRing = new Set(ring.map((p) => p.id));
    const options = all.filter((p) => !inRing.has(p.id));
    const full = ring.length >= HOME_PLACES_MAX;
    body = (
      <>
        {ring.length ? (
          <Box component="ol" aria-label="Home places, closest first" data-testid="home-places" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
            {ring.map((p, i) => (
              <Box component="li" key={p.id} data-testid="home-place-row" sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 52, borderBottom: 1, borderColor: 'divider' }}>
                <Typography component="span" aria-hidden="true" sx={{ width: 28, flexShrink: 0, fontFamily: GOTHIC, fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {i + 1}.
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography data-testid="home-place-name" sx={{ fontFamily: GOTHIC, fontSize: '1rem', fontWeight: 600, color: 'text.primary', overflowWrap: 'anywhere' }}>
                    {p.name}
                  </Typography>
                  <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>{labelFor(KIND_LABEL, p.kind)}</Typography>
                </Box>
                <IconButton aria-label={`Move ${p.name} up`} disabled={i === 0 || saving} onClick={() => move(i, -1)} sx={iconSx}>
                  <UpIcon sx={{ fontSize: 20 }} />
                </IconButton>
                <IconButton aria-label={`Move ${p.name} down`} disabled={i === ring.length - 1 || saving} onClick={() => move(i, 1)} sx={iconSx}>
                  <DownIcon sx={{ fontSize: 20 }} />
                </IconButton>
                <IconButton aria-label={`Remove ${p.name}`} disabled={saving} onClick={() => save(ring.filter((x) => x.id !== p.id))} sx={iconSx}>
                  <RemoveIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography data-testid="home-places-empty" sx={{ fontStyle: 'italic', color: 'text.secondary', mb: 2 }}>
            No home places yet, so Local is whatever the local papers print.
          </Typography>
        )}
        <Autocomplete
          options={options}
          value={null}
          inputValue={input}
          onInputChange={(_, v, reason) => setInput(reason === 'reset' ? '' : v)}
          onChange={(_, picked) => {
            if (!picked) return;
            setInput('');
            save([...ring, picked]);
          }}
          getOptionLabel={(p) => p.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderOption={(props, p) => (
            <Box component="li" {...props} key={p.id} sx={{ minHeight: 44, display: 'flex', justifyContent: 'space-between', gap: 3, fontFamily: GOTHIC }}>
              <span>{p.name}</span>
              <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
                {labelFor(KIND_LABEL, p.kind)}
              </Box>
            </Box>
          )}
          disabled={full || saving || !placesQ.data}
          noOptionsText="No place by that name in the gazetteer."
          blurOnSelect
          sx={{ mt: 4, maxWidth: 420 }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={full ? `${HOME_PLACES_MAX} is the most` : 'Add a place'}
              placeholder={full ? undefined : 'Town or county'}
              inputProps={{ ...params.inputProps, 'data-testid': 'add-home-place' }}
            />
          )}
        />
      </>
    );
  }

  return (
    <Box component="section" aria-labelledby="settings-home-places" id="settings-home-places-section" sx={{ mt: 6 }}>
      <Typography id="settings-home-places" component="h2" sx={{ ...flagSx, color: 'text.primary', borderTop: 2, borderColor: 'text.primary', pt: 2, mb: 2 }}>
        Home places
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 4 }}>{HOME_PLACES_HELP}</Typography>
      {body}
    </Box>
  );
}
