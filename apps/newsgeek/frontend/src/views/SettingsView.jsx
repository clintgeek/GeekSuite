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
 * answers BAD_USER_INPUT otherwise.
 *
 * One way to save (UX review 2026-11-18, finding 12): like every other
 * control on this page, the links save themselves — when a field is left and
 * every link is complete and valid, and when a link is removed (with Undo).
 * "Saved." under the list says it landed. A complete edit still pending when
 * the page goes away is sent on the way out, so Back never drops it; a link
 * left half-filled can't be saved and says what it needs. Then "Publishers" (PublishersSettings):
 * what the reader subscribes to or hid from the Source sheet, and which
 * publishers open with one of these links. Editing a link's template gives
 * it a new id, so the publishers that opened with it go back to the original.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import { Add as AddIcon, DeleteOutline as RemoveIcon } from '@mui/icons-material';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import Column from '../components/Column';
import HomePlacesSettings from '../components/HomePlacesSettings';
import InkSwitch from '../components/InkSwitch';
import PublishersSettings from '../components/PublishersSettings';
import { SET_NEWS_PREFS, SET_NEWS_PUBLISHER_OPENER } from '../graphql/mutations';
import { GET_NEWS_PREFS } from '../graphql/queries';
import { GOTHIC, flagSx, visuallyHiddenSx } from '../theme/theme';
import { MAX_LABEL, MAX_READER_LINKS, READER_LINK_HELP, READER_LINK_PLACEHOLDER, cleanReaderLinks, readerLinkErrors } from '../utils/readerLinks';

const linksKey = (list) => JSON.stringify(cleanReaderLinks(list));
const same = (a, b) => linksKey(a) === linksKey(b);

/** A mutation's `update` that replaces the cached prefs with what `field` answered. */
const writePrefsFrom = (field) => (cache, { data }) => {
  if (data?.[field]) cache.writeQuery({ query: GET_NEWS_PREFS, data: { newsPrefs: data[field] } });
};
const plainLink = ({ label, template }) => ({ label, template });
/** `list` with each removed link put back at the place it had. */
const withRestored = (list, removed) => {
  const out = [...list];
  for (const { link, at } of removed) out.splice(Math.min(at, out.length), 0, plainLink(link));
  return out;
};

export const NEW_TAB_LABEL = 'Open stories in a new tab';
export const LEAVE_SAVE_FAILED = 'Couldn’t save your open-with links. Open Settings to try again.';
export const NEW_TAB_HELP = 'Off: stories open here, and Back brings you back to NewsGeek.';

export default function SettingsView() {
  const { notify } = useToast();
  const prefsQ = useQuery(GET_NEWS_PREFS, { fetchPolicy: 'cache-and-network' });
  const saved = prefsQ.data?.newsPrefs?.readerLinks;
  const [links, setLinks] = useState(null);
  // Which fields have been left ("0:label"): their errors show from then on.
  const [left, setLeft] = useState(() => new Set());
  // 'saving' | 'saved' | null — said under the list.
  const [saveState, setSaveState] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [setPrefs] = useMutation(SET_NEWS_PREFS);
  const client = useApolloClient();
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
  const validOf = (list) => list.every((l) => !Object.keys(readerLinkErrors(l)).length);

  const setLink = (i, key) => (e) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: e.target.value } : l)));

  const writeLinks = (list) => setPrefs({ variables: { input: { readerLinks: cleanReaderLinks(list) } }, update: writePrefsFrom('newsSetPrefs') });

  // What the gateway has now — read through a ref, so Undo (fired from a toast
  // made a render ago) compares against the save that just landed.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  // The list a save is carrying right now (linksKey), so leaving the page doesn't send it twice.
  const sending = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  /** Save `list` whole when every link in it is complete; the prefs the gateway answered once it landed, else null. */
  const persist = async (list) => {
    const current = savedRef.current;
    if (!current || same(list, current) || !validOf(list)) return null;
    setSaveError('');
    setSaveState('saving');
    const key = linksKey(list);
    sending.current = key;
    try {
      const res = await writeLinks(list);
      setSaveState('saved');
      return res?.data?.newsSetPrefs ?? null;
    } catch (err) {
      setSaveState(null);
      setSaveError(err?.graphQLErrors?.[0]?.message || err?.message || 'Couldn’t save. Try again.');
      // The page is gone (Back straight from a field): the line under the list can't say it.
      if (!mounted.current) notifyRef.current(LEAVE_SAVE_FAILED, { tone: 'error' });
      return null;
    } finally {
      if (sending.current === key) sending.current = null;
    }
  };

  // Enter (Go on a phone keyboard) in a field: save now, and show what's missing.
  // A form of several fields and no submit button never submits on Enter by
  // itself, so the key is caught here too.
  const submit = (e) => {
    e.preventDefault();
    setLeft(new Set(links.flatMap((_, i) => [`${i}:label`, `${i}:template`])));
    persist(links);
  };
  const enterSaves = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.target.tagName === 'INPUT') submit(e);
  };

  const leave = (i, key) => () => {
    setLeft((prev) => new Set(prev).add(`${i}:${key}`));
    persist(links);
  };

  /**
   * Undo a removal. Removing a link also drops, on the gateway, every
   * publisher that opened with it (newsSetPrefs pulls openers whose link is
   * gone), so Undo puts the link back first — into what the gateway has now,
   * at its old place, so its id (a hash of the template) is the same — and
   * then those publishers, one at a time (each opener write rewrites the
   * whole list). Through the client, so it still works once the page is left.
   */
  const undoRemove = async (removed, lost) => {
    setLinks((ls) => (ls ? withRestored(ls, removed) : ls));
    try {
      const now = client.readQuery({ query: GET_NEWS_PREFS })?.newsPrefs?.readerLinks ?? savedRef.current ?? [];
      await client.mutate({
        mutation: SET_NEWS_PREFS,
        variables: { input: { readerLinks: cleanReaderLinks(withRestored(now.map(plainLink), removed)) } },
        update: writePrefsFrom('newsSetPrefs'),
      });
      for (const o of lost) {
        await client.mutate({
          mutation: SET_NEWS_PUBLISHER_OPENER,
          variables: o.sourceId ? { sourceId: o.sourceId, linkId: o.linkId } : { domain: o.domain, linkId: o.linkId },
          update: writePrefsFrom('newsSetPublisherOpener'),
        });
      }
    } catch {
      notify('Couldn’t put the link back. Try again.', { tone: 'error' });
    }
  };

  const remove = async (i) => {
    const gone = links[i];
    const next = links.filter((_, j) => j !== i);
    // What the gateway has before: the links with their ids, and who opens with them.
    const savedBefore = savedRef.current ?? [];
    const openersBefore = prefsRef.current?.openers ?? [];
    setLinks(next);
    setLeft(new Set());
    const after = await persist(next);
    if (!after) return;
    const kept = new Set((after.readerLinks ?? []).map((l) => l.id));
    const removed = savedBefore.map((link, at) => ({ link, at })).filter(({ link }) => !kept.has(link.id));
    if (!removed.length) return;
    const removedIds = new Set(removed.map(({ link }) => link.id));
    const lost = openersBefore.filter((o) => removedIds.has(o.linkId));
    const name = gone.label.trim() || 'Link';
    notify(`${name} removed.`, {
      tone: 'success',
      action: (
        <Button color="inherit" size="small" onClick={() => undoRemove(removed, lost)}>
          Undo
        </Button>
      ),
    });
  };

  // Leaving the page with a complete edit not yet saved (Back straight from a
  // field): send it on the way out — unless the blur that came first is
  // already sending that same list — and say so if it fails.
  const pending = useRef(null);
  pending.current = dirty && !invalid ? links : null;
  useEffect(
    () => () => {
      if (!pending.current || linksKey(pending.current) === sending.current) return;
      client
        .mutate({
          mutation: SET_NEWS_PREFS,
          variables: { input: { readerLinks: cleanReaderLinks(pending.current) } },
          update: writePrefsFrom('newsSetPrefs'),
        })
        .catch(() => notifyRef.current(LEAVE_SAVE_FAILED, { tone: 'error' }));
    },
    [client]
  );

  return (
    <Column>
      {/* The top bar already says "Settings" (UX review 2026-11-18, finding 7): the h1 is for screen readers. */}
      <Typography component="h1" sx={visuallyHiddenSx}>
        Settings
      </Typography>

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
          <Box component="form" noValidate onSubmit={submit} onKeyDown={enterSaves} data-testid="reader-links-form">
            {links.length ? null : (
              <Typography data-testid="reader-links-empty" sx={{ fontStyle: 'italic', color: 'text.secondary', mb: 4 }}>
                No open-with links yet. Stories open at the publisher.
              </Typography>
            )}
            <Box component="ol" aria-label="Open-with links" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {links.map((l, i) => {
                const show = {
                  label: left.has(`${i}:label`) ? errors[i].label : undefined,
                  template: left.has(`${i}:template`) ? errors[i].template : undefined,
                };
                return (
                  <Box component="li" key={i} data-testid="reader-link-row" sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', py: 4, borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <TextField
                        label={`Label ${i + 1}`}
                        value={l.label}
                        onChange={setLink(i, 'label')}
                        onBlur={leave(i, 'label')}
                        error={Boolean(show.label)}
                        helperText={show.label}
                        inputProps={{ maxLength: MAX_LABEL + 10 }}
                        fullWidth
                      />
                      <TextField
                        label={`Link template ${i + 1}`}
                        value={l.template}
                        onChange={setLink(i, 'template')}
                        onBlur={leave(i, 'template')}
                        error={Boolean(show.template)}
                        helperText={show.template || READER_LINK_HELP}
                        placeholder={READER_LINK_PLACEHOLDER}
                        inputProps={{ inputMode: 'url', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
                        fullWidth
                      />
                    </Box>
                    <IconButton aria-label={`Remove ${l.label.trim() || `link ${i + 1}`}`} onClick={() => remove(i)} sx={{ width: 44, height: 44, mt: 1 }}>
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
              <Typography
                role="status"
                data-testid="reader-links-status"
                sx={{ ml: 'auto', alignSelf: 'center', fontFamily: GOTHIC, fontStyle: 'italic', fontSize: '0.8125rem', color: 'text.secondary' }}
              >
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' && !dirty ? 'Saved.' : dirty && invalid ? 'Finish the link to save it.' : ''}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <PublishersSettings />
    </Column>
  );
}
