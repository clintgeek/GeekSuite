/**
 * "Add a source" (DOCS/NEWSGEEK_PLAN.md "Reader-added sources" → Screens):
 * any signed-in reader pastes a link, NewsGeek's backend finds the feed
 * (POST /api/discover), the reader checks a preview, then Add. A reader's
 * source is on for them and off for everyone else until they turn it on.
 *
 * A bottom sheet on a phone, a dialog from md up (GeekSheet decides).
 *
 * The states, in order:
 *   idle        the link field and "Find feed"
 *   discovering "Looking for a feed… ~5 s" (the request can be cancelled by closing)
 *   preview     site name (editable), the feed (a radio list when there are
 *               several), 3 headlines, the paywall verdict, kind / sections /
 *               places (editable), and for admins "On for everyone"; then Add
 *   nofeed      the backend's plain "No feed found — …" and "Try another link"
 *   error       rate limit, the SSRF guard's message, offline — as returned
 *   existing    discovery's existingSourceId, or newsCreateSource's
 *               DUPLICATE_FEED (extensions.sourceId): "Already here" with
 *               "Turn it on", or "It's already in your paper"
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { Check as CheckIcon, ContentPaste as PasteIcon, OpenInNew as OpenIcon } from '@mui/icons-material';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { GeekSheet, useToast } from '@geeksuite/ui';
import { Link as RouterLink } from 'react-router-dom';
import { discoverSource } from '../api/discover';
import InkSwitch from '../components/InkSwitch';
import PaywallBadge from '../components/PaywallBadge';
import { resetArticleLists } from '../graphql/cachePolicies';
import { CREATE_NEWS_SOURCE, SET_NEWS_SOURCE_DEFAULT_ON, SET_NEWS_SOURCE_ON } from '../graphql/mutations';
import { GET_NEWS_PLACES, GET_NEWS_SOURCE } from '../graphql/queries';
import { GOTHIC, flagSx } from '../theme/theme';
import { ADD_KINDS, gqlCode, inputFromPreview, normalizeLink, previewErrors, previewFormFrom } from '../utils/addSource';
import { relativeTime } from '../utils/dates';
import { hostOf } from '../utils/sources';
import { KIND_LABEL, SECTIONS, SECTION_LABEL } from '../utils/vocab';

export const NO_FEED_LINE = 'No feed found — this site only publishes web pages.';
export const ADDED_LINE = 'Added — it’s in your paper. Others can turn it on.';
export const ADDED_EVERYONE_LINE = 'Added — it’s on for everyone.';
export const ADD_RATE_LIMITED_LINE = 'You’ve added a lot of sources today. Try again tomorrow.';
const BAD_LINK_LINE = 'That doesn’t look like a link. Try something like arkadelphian.com.';

function Flag({ children, id }) {
  return (
    <Typography id={id} component="h3" sx={{ ...flagSx, color: 'text.secondary', mt: 5, mb: 2 }}>
      {children}
    </Typography>
  );
}

/** An outlined chip that toggles (no fill: the 12px filled-chip contrast landmine never applies). */
function ToggleChip({ label, selected, onClick }) {
  return (
    <Chip
      label={label}
      onClick={onClick}
      aria-pressed={selected}
      variant="outlined"
      icon={selected ? <CheckIcon aria-hidden="true" /> : undefined}
      sx={{
        height: 44,
        fontSize: '0.875rem',
        fontWeight: selected ? 700 : 500,
        color: 'text.primary',
        bgcolor: 'transparent',
        borderColor: selected ? 'text.primary' : 'divider',
        borderWidth: selected ? 2 : 1,
        '& .MuiChip-icon': { color: 'text.primary', fontSize: 18, ml: 2 },
      }}
    />
  );
}

/** "RSS · 25 items · newest 2h ago" */
function feedMeta(feed) {
  return [
    (feed.format || 'rss').toUpperCase(),
    feed.items != null ? `${feed.items} ${feed.items === 1 ? 'item' : 'items'}` : null,
    feed.newest ? `newest ${relativeTime(feed.newest)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function feedLabel(url) {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function PaywallVerdict({ paywall }) {
  const level = paywall?.level ?? 'unknown';
  let body;
  if (level === 'metered' || level === 'hard') {
    body = <PaywallBadge source={{ paywalled: true, access: { paywall: level } }} />;
  } else if (level === 'none') {
    body = <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.875rem' }}>No paywall found</Typography>;
  } else {
    body = <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.875rem' }}>Unknown — we couldn’t tell from one story</Typography>;
  }
  return (
    <Box data-testid="paywall-verdict" data-level={level}>
      {body}
      {paywall?.evidence ? (
        <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary', mt: 1, overflowWrap: 'anywhere' }}>{paywall.evidence}</Typography>
      ) : null}
    </Box>
  );
}

function Preview({ result, form, setForm, errors, places, placeById, isAdmin, addError }) {
  const feeds = result.feeds ?? [];
  const chosen = feeds.find((f) => f.url === form.feedUrl) ?? feeds[0];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleSection = (s) => set({ sections: form.sections.includes(s) ? form.sections.filter((x) => x !== s) : [...form.sections, s] });

  return (
    <Box data-testid="add-preview">
      {addError ? (
        <Typography role="alert" sx={{ fontFamily: GOTHIC, fontSize: '0.875rem', fontWeight: 600, color: 'error.main', borderLeft: 3, borderColor: 'error.main', pl: 3, py: 1, mb: 4 }}>
          {addError}
        </Typography>
      ) : null}

      {result.site?.homepage ? (
        <Link href={result.site.homepage} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, minHeight: 44, fontFamily: GOTHIC, fontSize: '0.875rem', color: 'text.primary' }}>
          {hostOf(result.site.homepage)}
          <OpenIcon aria-hidden="true" sx={{ fontSize: 14 }} />
        </Link>
      ) : null}

      <TextField
        label="Name"
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
        error={Boolean(errors.name)}
        helperText={errors.name}
        fullWidth
        sx={{ mt: 2 }}
      />

      <Flag id="add-feed-flag">{feeds.length > 1 ? `Feed · ${feeds.length} found` : 'Feed'}</Flag>
      {feeds.length > 1 ? (
        <RadioGroup aria-labelledby="add-feed-flag" value={form.feedUrl} onChange={(e) => set({ feedUrl: e.target.value })}>
          {feeds.map((f) => (
            <FormControlLabel
              key={f.url}
              value={f.url}
              control={<Radio sx={{ color: 'text.secondary', '&.Mui-checked': { color: 'text.primary' } }} />}
              sx={{ alignItems: 'flex-start', mx: 0, py: 1, borderBottom: 1, borderColor: 'divider', '& .MuiRadio-root': { mt: -1 } }}
              label={
                <Box sx={{ minWidth: 0, pt: 1.5 }}>
                  <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.875rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{feedLabel(f.url)}</Typography>
                  <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>{feedMeta(f)}</Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>
      ) : chosen ? (
        <Box>
          <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.875rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{feedLabel(chosen.url)}</Typography>
          <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>{feedMeta(chosen)}</Typography>
        </Box>
      ) : null}

      {chosen?.sampleTitles?.length ? (
        <>
          <Flag>Latest headlines</Flag>
          <Box component="ul" aria-label="Sample headlines" data-testid="sample-headlines" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {chosen.sampleTitles.slice(0, 3).map((t, i) => (
              <Typography key={i} component="li" sx={{ fontSize: '1rem', lineHeight: 1.4, py: 2, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
                {t}
              </Typography>
            ))}
          </Box>
        </>
      ) : null}

      <Flag>Paywall</Flag>
      <PaywallVerdict paywall={result.paywall} />

      <Flag id="add-kind-flag">Kind</Flag>
      <Box role="group" aria-labelledby="add-kind-flag" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {ADD_KINDS.map((k) => (
          <ToggleChip key={k} label={KIND_LABEL[k]} selected={form.kind === k} onClick={() => set({ kind: k })} />
        ))}
      </Box>

      <Flag id="add-sections-flag">Sections</Flag>
      <Box role="group" aria-labelledby="add-sections-flag" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {SECTIONS.map((s) => (
          <ToggleChip key={s} label={SECTION_LABEL[s]} selected={form.sections.includes(s)} onClick={() => toggleSection(s)} />
        ))}
      </Box>
      {errors.sections ? (
        <Typography role="alert" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'error.main', mt: 1 }}>
          {errors.sections}
        </Typography>
      ) : null}

      <Flag>Places it covers</Flag>
      <Autocomplete
        multiple
        options={places.map((p) => p.id)}
        value={form.placeIds}
        onChange={(_, ids) => set({ placeIds: ids, placesTouched: true })}
        getOptionLabel={(id) => placeById.get(id)?.name ?? id}
        ChipProps={{ variant: 'outlined' }}
        renderInput={(params) => <TextField {...params} label="Places" placeholder={form.placeIds.length ? '' : 'Add a town or county'} />}
      />

      {isAdmin ? (
        <Box sx={{ mt: 5, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <InkSwitch
            checked={form.defaultOn}
            onChange={(on) => set({ defaultOn: on })}
            label="On for everyone"
            labelPlacement="end"
            data-testid="add-default-on"
          />
          <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>
            Off: it’s in your paper only, and other readers can turn it on.
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}

function Plainly({ children, testId }) {
  return (
    <Box data-testid={testId} role="alert" sx={{ py: 4 }}>
      <Typography sx={{ fontSize: '1.0625rem', lineHeight: 1.5 }}>{children}</Typography>
    </Box>
  );
}

export default function AddSourceSheet({ open, onClose, sources = [], initialUrl = '', autoRun = false, isAdmin = false, onAddByHand }) {
  const client = useApolloClient();
  const { notify } = useToast();
  const [link, setLink] = useState(initialUrl);
  const [linkError, setLinkError] = useState('');
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [form, setForm] = useState(null);
  const [touched, setTouched] = useState(false);
  const [addError, setAddError] = useState('');
  const [existing, setExisting] = useState(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const { data: placeData } = useQuery(GET_NEWS_PLACES, { skip: !open });
  const places = useMemo(() => placeData?.newsPlaces ?? [], [placeData]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  const [create, createState] = useMutation(CREATE_NEWS_SOURCE, { refetchQueries: ['NewsSources'] });
  const [setDefaultOn] = useMutation(SET_NEWS_SOURCE_DEFAULT_ON);
  const [setSourceOn, sourceOnState] = useMutation(SET_NEWS_SOURCE_ON);

  // Places can land after the preview: resolve the suggested slugs then,
  // unless the reader has already edited the places.
  useEffect(() => {
    if (!result || !places.length) return;
    setForm((f) => (f && !f.placesTouched ? { ...f, placeIds: previewFormFrom(result, places).placeIds } : f));
  }, [places, result]);

  const showExisting = async (id, fallbackName) => {
    let found = sources.find((s) => s.id === id);
    if (!found) {
      try {
        const res = await client.query({ query: GET_NEWS_SOURCE, variables: { id }, fetchPolicy: 'network-only' });
        found = res.data?.newsSource;
      } catch {
        found = null;
      }
    }
    setExisting({ id, name: found?.name || fallbackName || 'This source', onForMe: Boolean(found?.onForMe) });
    setPhase('existing');
  };

  const run = async (text) => {
    const url = normalizeLink(text);
    if (!url) {
      setLinkError(BAD_LINK_LINE);
      return;
    }
    setLinkError('');
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase('discovering');
    try {
      const res = await discoverSource(url, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res?.existingSourceId) {
        await showExisting(res.existingSourceId, res.suggest?.name || res.site?.name);
        return;
      }
      if (!res?.ok || !res.feeds?.length) {
        setMessage(res?.message || NO_FEED_LINE);
        setPhase('nofeed');
        return;
      }
      setResult(res);
      setForm(previewFormFrom(res, places));
      setTouched(false);
      setAddError('');
      setPhase('preview');
    } catch (err) {
      if (ctrl.signal.aborted || err?.code === 'CANCELLED') return;
      setMessage(err?.message || NO_FEED_LINE);
      setPhase('error');
    }
  };

  // "Check" on a suggestion opens the sheet on https://<domain> and looks at once.
  useEffect(() => {
    if (open && autoRun && initialUrl) run(initialUrl);
    return () => abortRef.current?.abort();
    // Once per opening; run() reads the latest state through setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoRun, initialUrl]);

  const close = () => {
    abortRef.current?.abort();
    onClose?.();
  };

  const tryAnother = () => {
    setPhase('idle');
    setMessage('');
    setResult(null);
    setForm(null);
    setExisting(null);
    setAddError('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setLink(text.trim());
    } catch {
      inputRef.current?.focus();
    }
  };

  const errors = form ? previewErrors(form) : {};
  const shown = touched ? errors : {};

  const add = async () => {
    setTouched(true);
    setAddError('');
    if (Object.keys(errors).length) return;
    try {
      const res = await create({ variables: { input: inputFromPreview(form, result) } });
      const created = res.data?.newsCreateSource;
      let everyone = false;
      if (isAdmin && form.defaultOn && created?.id) {
        try {
          await setDefaultOn({ variables: { id: created.id, on: true } });
          everyone = true;
        } catch {
          notify('Added, but it isn’t on for everyone yet. Turn it on from its page.', { tone: 'error' });
        }
      }
      resetArticleLists(client.cache);
      notify(everyone ? ADDED_EVERYONE_LINE : ADDED_LINE, { tone: 'success' });
      onClose?.();
    } catch (err) {
      const { code, extensions, message: msg } = gqlCode(err);
      if (code === 'DUPLICATE_FEED' && extensions.sourceId) {
        await showExisting(extensions.sourceId, form.name);
        return;
      }
      setAddError(code === 'RATE_LIMITED' ? ADD_RATE_LIMITED_LINE : msg || 'Couldn’t add it. Try again.');
    }
  };

  const turnOn = async () => {
    try {
      await setSourceOn({
        variables: { id: existing.id, on: true },
        optimisticResponse: { newsSetSourceOn: { __typename: 'NewsSource', id: existing.id, onForMe: true, defaultOn: false } },
      });
      resetArticleLists(client.cache);
      notify('Turned on — it’s in your paper.', { tone: 'success' });
      onClose?.();
    } catch {
      notify('Couldn’t turn it on. Try again.', { tone: 'error' });
    }
  };

  const discovering = phase === 'discovering';
  const linkStage = phase === 'idle' || discovering;

  let actions;
  if (linkStage) {
    actions = (
      <Button type="submit" form="add-source-form" variant="contained" disableElevation disabled={discovering}>
        {discovering ? 'Looking…' : 'Find feed'}
      </Button>
    );
  } else if (phase === 'preview') {
    actions = [
      <Button key="back" color="inherit" onClick={tryAnother} disabled={createState.loading}>
        Try another link
      </Button>,
      <Button key="add" variant="contained" disableElevation onClick={add} disabled={createState.loading}>
        {createState.loading ? 'Adding…' : 'Add'}
      </Button>,
    ];
  } else if (phase === 'existing') {
    actions = existing?.onForMe
      ? [
          <Button key="back" color="inherit" onClick={tryAnother}>
            Try another link
          </Button>,
          <Button key="done" variant="contained" disableElevation onClick={close}>
            Done
          </Button>,
        ]
      : [
          <Button key="back" color="inherit" onClick={tryAnother} disabled={sourceOnState.loading}>
            Try another link
          </Button>,
          <Button key="on" variant="contained" disableElevation onClick={turnOn} disabled={sourceOnState.loading}>
            {sourceOnState.loading ? 'Turning on…' : 'Turn it on'}
          </Button>,
        ];
  } else {
    actions = (
      <Button variant="contained" disableElevation onClick={tryAnother}>
        Try another link
      </Button>
    );
  }

  return (
    <GeekSheet
      open={open}
      onClose={close}
      title="Add a source"
      description={linkStage ? 'On for you, off for everyone else until they turn it on.' : undefined}
      actions={actions}
      initialFocus={linkStage && !autoRun ? 'input' : undefined}
      bodySx={{ px: { xs: 4, sm: 6 }, pb: 4 }}
      headerSx={{ pl: { xs: 4, sm: 6 } }}
    >
      <Box data-testid="add-source-sheet" data-phase={phase}>
        {linkStage ? (
          <Box
            component="form"
            id="add-source-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!discovering) run(link);
            }}
            sx={{ pt: 2 }}
          >
            <TextField
              inputRef={inputRef}
              label="Link to the site or a story"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                if (linkError) setLinkError('');
              }}
              disabled={discovering}
              error={Boolean(linkError)}
              helperText={linkError || 'A homepage or any story. A bare domain works: arkadelphian.com'}
              placeholder="https://"
              fullWidth
              inputProps={{
                inputMode: 'url',
                autoCapitalize: 'none',
                autoCorrect: 'off',
                spellCheck: false,
                autoComplete: 'url',
                enterKeyHint: 'go',
              }}
              InputProps={
                typeof navigator !== 'undefined' && navigator.clipboard?.readText
                  ? {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton aria-label="Paste link" onClick={paste} disabled={discovering} edge="end" sx={{ minWidth: 44, minHeight: 44 }}>
                            <PasteIcon />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }
                  : undefined
              }
            />
            {discovering ? (
              <Box role="status" data-testid="discovering" sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 5 }}>
                <CircularProgress size={20} aria-hidden="true" sx={{ color: 'text.secondary' }} />
                <Typography sx={{ fontStyle: 'italic', color: 'text.secondary' }}>Looking for a feed… ~5 s</Typography>
              </Box>
            ) : null}
            {isAdmin && onAddByHand && !discovering ? (
              <Button color="inherit" onClick={onAddByHand} sx={{ mt: 4, px: 0, textDecoration: 'underline', textUnderlineOffset: '0.2em' }}>
                Enter the feed by hand
              </Button>
            ) : null}
          </Box>
        ) : null}

        {phase === 'preview' && form ? (
          <Preview result={result} form={form} setForm={setForm} errors={shown} places={places} placeById={placeById} isAdmin={isAdmin} addError={addError} />
        ) : null}

        {phase === 'nofeed' ? <Plainly testId="add-nofeed">{message}</Plainly> : null}
        {phase === 'error' ? <Plainly testId="add-error">{message}</Plainly> : null}

        {phase === 'existing' && existing ? (
          <Box data-testid="add-existing" sx={{ py: 4 }}>
            <Typography component="p" sx={{ ...flagSx, color: 'text.secondary', mb: 2 }}>
              Already here
            </Typography>
            <Typography variant="h4" component="p" sx={{ mb: 2 }}>
              <Link component={RouterLink} to={`/sources/${encodeURIComponent(existing.id)}`} onClick={close} underline="hover" sx={{ color: 'text.primary', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
                {existing.name}
              </Link>
            </Typography>
            <Typography sx={{ color: 'text.secondary' }}>
              {existing.onForMe ? 'It’s already in your paper.' : 'Someone already reads this feed. Turn it on to put it in your paper.'}
            </Typography>
          </Box>
        ) : null}
      </Box>
    </GeekSheet>
  );
}
