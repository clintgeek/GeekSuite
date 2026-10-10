/**
 * Add / edit a source (admin). One column of plain fields, full-screen on a
 * phone, Save in the dialog's foot. Sends NewsSourceInput exactly as the
 * contract names it; on edit, feeds replace by URL and keep their poll state
 * (the gateway's rule).
 */
import React, { useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Add as AddIcon, DeleteOutline as RemoveIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { CREATE_NEWS_SOURCE, UPDATE_NEWS_SOURCE } from '../graphql/mutations';
import { GET_NEWS_PLACES, GET_NEWS_SOURCES } from '../graphql/queries';
import { flagSx } from '../theme/theme';
import { formErrors, formFromSource, inputFromForm } from '../utils/sources';
import {
  CONTENT_LABEL,
  CONTENT_LEVELS,
  FEED_FORMATS,
  KIND_LABEL,
  PAYWALLS,
  PAYWALL_LABEL,
  SECTIONS,
  SECTION_LABEL,
  SOURCE_KINDS,
} from '../utils/vocab';

function Legend({ children }) {
  return (
    <FormLabel component="legend" sx={{ ...flagSx, color: 'text.secondary', mb: 1, '&.Mui-focused': { color: 'text.secondary' } }}>
      {children}
    </FormLabel>
  );
}

export default function SourceFormDialog({ open, onClose, source, onSaved }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const editing = Boolean(source);
  const [form, setForm] = useState(() => formFromSource(source));
  const [touched, setTouched] = useState(false);
  const { notify } = useToast();
  const { data: placeData } = useQuery(GET_NEWS_PLACES, { skip: !open });
  const places = useMemo(() => placeData?.newsPlaces ?? [], [placeData]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  const [create, createState] = useMutation(CREATE_NEWS_SOURCE, { refetchQueries: [{ query: GET_NEWS_SOURCES }] });
  const [update, updateState] = useMutation(UPDATE_NEWS_SOURCE);
  const saving = createState.loading || updateState.loading;

  const errors = formErrors(form);
  const show = (key) => (touched ? errors[key] : undefined);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setFeed = (i, key, value) => setForm((f) => ({ ...f, feeds: f.feeds.map((feed, j) => (j === i ? { ...feed, [key]: value } : feed)) }));
  const toggleSection = (s) =>
    setForm((f) => ({ ...f, sections: f.sections.includes(s) ? f.sections.filter((x) => x !== s) : [...f.sections, s] }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    const input = inputFromForm(form);
    try {
      const res = editing ? await update({ variables: { id: source.id, input } }) : await create({ variables: { input } });
      const saved = editing ? res.data?.newsUpdateSource : res.data?.newsCreateSource;
      notify(editing ? 'Source saved.' : `${saved?.name ?? 'Source'} added. Its feeds are polled on the next pass.`, { tone: 'success' });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      notify(err?.message || 'Could not save the source.', { tone: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="source-form-title">
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <DialogTitle id="source-form-title" sx={{ fontWeight: 700 }}>
          {editing ? `Edit ${source.name}` : 'Add a source'}
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <TextField label="Name" value={form.name} onChange={set('name')} required error={Boolean(show('name'))} helperText={show('name')} autoFocus={!editing} />
          <TextField
            label="Homepage"
            value={form.homepage}
            onChange={set('homepage')}
            type="url"
            inputMode="url"
            placeholder="https://"
            error={Boolean(show('homepage'))}
            helperText={show('homepage')}
          />
          <TextField select label="Kind" value={form.kind} onChange={set('kind')} helperText="Official sources (city notices, NWS) never count as coverage.">
            {SOURCE_KINDS.map((k) => (
              <MenuItem key={k} value={k}>
                {KIND_LABEL[k]}
              </MenuItem>
            ))}
          </TextField>

          <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
            <Legend>Sections</Legend>
            <FormGroup row sx={{ columnGap: 2 }}>
              {SECTIONS.map((s) => (
                <FormControlLabel key={s} control={<Checkbox checked={form.sections.includes(s)} onChange={() => toggleSection(s)} />} label={SECTION_LABEL[s]} />
              ))}
            </FormGroup>
          </Box>

          <Autocomplete
            multiple
            options={places.map((p) => p.id)}
            value={form.placeIds}
            onChange={(_, ids) => setForm((f) => ({ ...f, placeIds: ids }))}
            getOptionLabel={(id) => placeById.get(id)?.name ?? id}
            renderOption={(props, id) => {
              const { key, ...rest } = props;
              const p = placeById.get(id);
              return (
                <li key={key} {...rest}>
                  {p?.name ?? id}
                  {p?.kind ? (
                    <Typography component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: '0.8125rem' }}>
                      {p.kind}
                    </Typography>
                  ) : null}
                </li>
              );
            }}
            ChipProps={{ variant: 'outlined', size: 'small' }}
            renderInput={(params) => <TextField {...params} label="Places it covers" />}
          />

          <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
            <Legend>Feeds</Legend>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {form.feeds.map((feed, i) => (
                <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 4, borderBottom: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <TextField
                      label={`Feed URL ${form.feeds.length > 1 ? i + 1 : ''}`.trim()}
                      value={feed.url}
                      onChange={(e) => setFeed(i, 'url', e.target.value)}
                      type="url"
                      inputMode="url"
                      placeholder="https://example.com/feed/"
                      fullWidth
                    />
                    {form.feeds.length > 1 ? (
                      <IconButton aria-label={`Remove feed ${i + 1}`} onClick={() => setForm((f) => ({ ...f, feeds: f.feeds.filter((_, j) => j !== i) }))} sx={{ mt: 1 }}>
                        <RemoveIcon />
                      </IconButton>
                    ) : null}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 3 }}>
                    <TextField select label="Format" value={feed.format} onChange={(e) => setFeed(i, 'format', e.target.value)} sx={{ flex: 1 }}>
                      {FEED_FORMATS.map((fmt) => (
                        <MenuItem key={fmt} value={fmt}>
                          {fmt.toUpperCase()}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="Poll every (min)"
                      type="number"
                      value={feed.pollEveryMin}
                      onChange={(e) => setFeed(i, 'pollEveryMin', e.target.value)}
                      inputProps={{ min: 5, step: 5, inputMode: 'numeric' }}
                      sx={{ flex: 1 }}
                    />
                  </Box>
                </Box>
              ))}
              {show('feeds') ? <FormHelperText error>{show('feeds')}</FormHelperText> : null}
              <Button
                startIcon={<AddIcon />}
                color="inherit"
                onClick={() => setForm((f) => ({ ...f, feeds: [...f.feeds, { url: '', format: 'rss', pollEveryMin: 30 }] }))}
                sx={{ alignSelf: 'flex-start' }}
              >
                Add another feed
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <TextField select label="Paywall" value={form.paywall} onChange={set('paywall')} sx={{ flex: '1 1 160px' }}>
              {PAYWALLS.map((p) => (
                <MenuItem key={p} value={p}>
                  {PAYWALL_LABEL[p]}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Feed content" value={form.content} onChange={set('content')} sx={{ flex: '1 1 160px' }}>
              {CONTENT_LEVELS.map((c) => (
                <MenuItem key={c} value={c}>
                  {CONTENT_LABEL[c]}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <TextField
            label="Blocked domains"
            value={form.blockedDomains}
            onChange={set('blockedDomains')}
            multiline
            minRows={2}
            helperText="One per line. Items linking to these are dropped (e.g. legacy.com for an aggregator)."
          />
          <TextField label="Notes" value={form.notes} onChange={set('notes')} multiline minRows={2} />
        </DialogContent>
        <DialogActions sx={{ px: 6, py: 3, pb: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <Button onClick={onClose} color="inherit" disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disableElevation disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Add source'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
