/**
 * Settings (`/settings`). First "Home places" (HomePlacesSettings): the
 * reader's ring, closest first, which decides what is Local on Today. Then
 * "Reading" (plan "Opening", 2026-10-11): "Open stories in a new tab"
 * (NewsPrefs.openInNewTab, on by default) — off, every outbound story link
 * opens in this window and Back returns to NewsGeek. Then
 * "Open-with links" — the reader's own URL
 * templates, offered in each story's ⋯ menu after "Open at publisher"
 * (NewsPrefs.readerLinks, max 5). Saved whole through
 * newsSetPrefs({ readerLinks }); the gateway re-checks every rule here and
 * answers BAD_USER_INPUT otherwise. Then "Publishers" (PublishersSettings):
 * what the reader subscribes to or hid from the Source sheet, and which
 * publishers open with one of these links. Editing a link's template gives
 * it a new id, so the publishers that opened with it go back to the original.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import { Add as AddIcon, DeleteOutline as RemoveIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import Column from '../components/Column';
import HomePlacesSettings from '../components/HomePlacesSettings';
import InkSwitch from '../components/InkSwitch';
import PublishersSettings from '../components/PublishersSettings';
import { SET_NEWS_PREFS } from '../graphql/mutations';
import { GET_NEWS_PREFS } from '../graphql/queries';
import { GOTHIC, flagSx } from '../theme/theme';
import { MAX_LABEL, MAX_READER_LINKS, READER_LINK_HELP, READER_LINK_PLACEHOLDER, cleanReaderLinks, readerLinkErrors } from '../utils/readerLinks';

const same = (a, b) => JSON.stringify(cleanReaderLinks(a)) === JSON.stringify(cleanReaderLinks(b));

export const NEW_TAB_LABEL = 'Open stories in a new tab';
export const NEW_TAB_HELP = 'Off: stories open here, and Back brings you back to NewsGeek.';

export default function SettingsView() {
  const { notify } = useToast();
  const prefsQ = useQuery(GET_NEWS_PREFS, { fetchPolicy: 'cache-and-network' });
  const saved = prefsQ.data?.newsPrefs?.readerLinks;
  const [links, setLinks] = useState(null);
  const [touched, setTouched] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [setPrefs, { loading: saving }] = useMutation(SET_NEWS_PREFS);
  const [setWindowPref, { loading: savingWindow }] = useMutation(SET_NEWS_PREFS);
  const prefs = prefsQ.data?.newsPrefs;
  const openInNewTab = prefs?.openInNewTab ?? true;

  const toggleNewTab = async (next) => {
    try {
      await setWindowPref({
        variables: { input: { openInNewTab: next } },
        optimisticResponse: { newsSetPrefs: { ...prefs, __typename: 'NewsPrefs', openInNewTab: next } },
        update(cache, { data }) {
          if (data?.newsSetPrefs) cache.writeQuery({ query: GET_NEWS_PREFS, data: { newsPrefs: data.newsSetPrefs } });
        },
      });
    } catch {
      notify('Couldn’t change where stories open. Try again.', { tone: 'error' });
    }
  };

  // Seed the editor once the prefs arrive (and again after a save lands).
  useEffect(() => {
    if (saved && links === null) setLinks(saved.map(({ label, template }) => ({ label, template })));
  }, [saved, links]);

  const errors = (links ?? []).map((l) => readerLinkErrors(l));
  const invalid = errors.some((e) => Object.keys(e).length);
  const dirty = links !== null && saved && !same(links, saved);

  const setLink = (i, key) => (e) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: e.target.value } : l)));

  const save = async (e) => {
    e.preventDefault();
    setTouched(true);
    setSaveError('');
    if (invalid) return;
    const readerLinks = cleanReaderLinks(links);
    try {
      await setPrefs({
        variables: { input: { readerLinks } },
        update(cache, { data }) {
          if (data?.newsSetPrefs) cache.writeQuery({ query: GET_NEWS_PREFS, data: { newsPrefs: data.newsSetPrefs } });
        },
      });
      setLinks(readerLinks);
      setTouched(false);
      notify('Saved.', { tone: 'success' });
    } catch (err) {
      setSaveError(err?.graphQLErrors?.[0]?.message || err?.message || 'Couldn’t save. Try again.');
    }
  };

  return (
    <Column>
      <Box component="header" sx={{ pt: 6, pb: 3, borderBottom: 2, borderColor: 'text.primary' }}>
        <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.5rem' } }}>
          Settings
        </Typography>
      </Box>

      <HomePlacesSettings />

      <Box component="section" aria-labelledby="settings-reading" data-testid="settings-reading" sx={{ mt: 10 }}>
        <Typography id="settings-reading" component="h2" sx={{ ...flagSx, color: 'text.primary', borderTop: 2, borderColor: 'text.primary', pt: 2, mb: 2 }}>
          Reading
        </Typography>
        <Box sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <InkSwitch
            checked={openInNewTab}
            onChange={toggleNewTab}
            disabled={!prefs || savingWindow}
            label={NEW_TAB_LABEL}
            labelPlacement="start"
            sx={{ width: '100%', justifyContent: 'space-between', minHeight: 48 }}
            labelSx={{ fontFamily: GOTHIC, fontSize: '1rem', fontWeight: 600, letterSpacing: 0, textTransform: 'none', whiteSpace: 'normal' }}
          />
          <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', lineHeight: 1.4, color: 'text.secondary', pb: 3, pr: 16 }}>
            {NEW_TAB_HELP}
          </Typography>
        </Box>
      </Box>

      <Box component="section" aria-labelledby="settings-open-with" sx={{ mt: 10 }}>
        <Typography id="settings-open-with" component="h2" sx={{ ...flagSx, color: 'text.primary', borderTop: 2, borderColor: 'text.primary', pt: 2, mb: 2 }}>
          Open-with links
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 4 }}>
          Extra ways to open a story, in its ⋯ menu after “Open at publisher”. Up to {MAX_READER_LINKS}.
        </Typography>

        {links === null ? (
          prefsQ.error ? (
            <Box role="alert">
              <Typography sx={{ color: 'text.secondary', mb: 3 }}>Couldn’t load your settings.</Typography>
              <Button variant="outlined" color="inherit" onClick={() => prefsQ.refetch()}>
                Try again
              </Button>
            </Box>
          ) : (
            <CircularProgress size={20} aria-label="Loading settings" sx={{ color: 'text.secondary' }} />
          )
        ) : (
          <Box component="form" noValidate onSubmit={save} data-testid="reader-links-form">
            {links.length ? null : (
              <Typography data-testid="reader-links-empty" sx={{ fontStyle: 'italic', color: 'text.secondary', mb: 4 }}>
                No open-with links yet. Stories open at the publisher.
              </Typography>
            )}
            <Box component="ol" aria-label="Open-with links" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {links.map((l, i) => {
                const show = touched ? errors[i] : {};
                return (
                  <Box component="li" key={i} data-testid="reader-link-row" sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', py: 4, borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <TextField
                        label={`Label ${i + 1}`}
                        value={l.label}
                        onChange={setLink(i, 'label')}
                        error={Boolean(show.label)}
                        helperText={show.label}
                        inputProps={{ maxLength: MAX_LABEL + 10 }}
                        fullWidth
                      />
                      <TextField
                        label={`Link template ${i + 1}`}
                        value={l.template}
                        onChange={setLink(i, 'template')}
                        error={Boolean(show.template)}
                        helperText={show.template || READER_LINK_HELP}
                        placeholder={READER_LINK_PLACEHOLDER}
                        inputProps={{ inputMode: 'url', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
                        fullWidth
                      />
                    </Box>
                    <IconButton aria-label={`Remove ${l.label.trim() || `link ${i + 1}`}`} onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} sx={{ width: 44, height: 44, mt: 1 }}>
                      <RemoveIcon />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
            {saveError ? (
              <Typography role="alert" sx={{ fontFamily: GOTHIC, fontSize: '0.875rem', fontWeight: 600, color: 'error.main', mt: 4 }}>
                {saveError}
              </Typography>
            ) : null}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 4 }}>
              <Button
                color="inherit"
                startIcon={<AddIcon />}
                disabled={links.length >= MAX_READER_LINKS}
                onClick={() => setLinks((ls) => [...ls, { label: '', template: '' }])}
              >
                {links.length >= MAX_READER_LINKS ? `${MAX_READER_LINKS} is the most` : 'Add a link'}
              </Button>
              <Button type="submit" variant="contained" disableElevation disabled={saving || !dirty} sx={{ ml: 'auto' }}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      <PublishersSettings />
    </Column>
  );
}
