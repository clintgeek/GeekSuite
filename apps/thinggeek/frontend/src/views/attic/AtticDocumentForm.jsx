/**
 * `/attic/add` and `/attic/edit/:id` — one phone-first screen:
 *
 *   type      chips (the household's document types)
 *   who       person chips (several may share a document: a joint policy)
 *   capture   FRONT then BACK for a card, the photo page for a passport,
 *             pages for everything else (add only; the document page adds more)
 *   numbers   the type's identifier fields — masked as you type, sent ONLY to
 *             the Attic's backend, which seals them (never through the gateway)
 *   details   the type's plain fields, issued / expiry dates, linked things, notes
 *
 * Saving: the gateway stores the document (no numbers in it), then the
 * backend seals the numbers, then each image is uploaded and sealed.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, ButtonBase, Chip, CircularProgress, IconButton, InputAdornment, LinearProgress, MenuItem, TextField, Typography } from '@mui/material';
import { Check as CheckIcon, VisibilityOffOutlined as HideIcon, VisibilityOutlined as ShowIcon } from '@mui/icons-material';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@geeksuite/collection';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import SectionHeading from '../../components/SectionHeading';
import TypeIcon from '../../components/TypeIcon';
import { SEARCH_THINGS } from '../../graphql/queries';
import { CREATE_ATTIC_DOCUMENT, CREATE_ATTIC_PERSON, GET_ATTIC_DOCUMENT, GET_ATTIC_HOME, UPDATE_ATTIC_DOCUMENT } from '../../graphql/attic';
import { saveIdentifiers, uploadAtticFile } from '../../api/attic';
import { useLockOnError, useVault } from '../../hooks/useVault';
import { calendarDateToUtcIso, utcIsoToInputValue } from '../../utils/dates';
import { AtticGate, HERO_BUTTON_SX } from './AtticLock';
import { atticDocPath, panelSx } from './AtticParts';
import { AtticTypeIcon, captureSlotsFor, sideLabelFor } from './atticIcons';
import { CaptureSlot } from './CardCapture';

/** A number field: masked by default (CSS, not type=password — no password manager offers to save a passport number). */
export function SecretInput({ label, value, onChange, onFile, strict, id }) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={onFile ? 'On file — type to replace' : ''}
      autoComplete="off"
      helperText={strict ? 'The most sensitive number here. It stays hidden unless you ask.' : onFile ? 'Leave empty to keep the one on file.' : 'Sealed before it is stored.'}
      inputProps={{
        'data-lpignore': 'true',
        'data-1p-ignore': 'true',
        autoCapitalize: 'characters',
        spellCheck: 'false',
        maxLength: 120,
        'data-masked': shown ? 'false' : 'true',
        style: { fontFamily: '"Roboto Mono", ui-monospace, monospace' },
      }}
      sx={{ '& input[data-masked="true"]': { WebkitTextSecurity: 'disc', textSecurity: 'disc' } }}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton aria-label={shown ? `Hide ${label}` : `Show ${label}`} onClick={() => setShown((s) => !s)} edge="end" sx={{ width: 44, height: 44 }}>
              {shown ? <HideIcon /> : <ShowIcon />}
            </IconButton>
          </InputAdornment>
        ),
      }}
      fullWidth
    />
  );
}

function PlainField({ field, value, onChange }) {
  const common = { label: field.label, value: value ?? '', onChange: (e) => onChange(e.target.value), fullWidth: true, required: field.required };
  if (field.kind === 'date') return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} />;
  if (field.kind === 'number') return <TextField {...common} inputProps={{ inputMode: 'decimal' }} />;
  if (field.kind === 'choice') {
    return (
      <TextField {...common} select>
        <MenuItem value="">—</MenuItem>
        {(field.choices ?? []).map((c) => (
          <MenuItem key={c} value={c}>
            {c}
          </MenuItem>
        ))}
      </TextField>
    );
  }
  return <TextField {...common} inputProps={{ maxLength: 300, autoComplete: 'off', inputMode: field.kind === 'url' ? 'url' : undefined }} />;
}

function ThingLinks({ value, onChange }) {
  const [input, setInput] = useState('');
  const q = useDebouncedValue(input.trim(), 250);
  const { data, loading } = useQuery(SEARCH_THINGS, { variables: { filter: q ? { q } : null, limit: 12 }, fetchPolicy: 'cache-and-network' });
  const picked = new Set(value.map((t) => t.id));
  const options = (data?.things?.things ?? []).filter((t) => !picked.has(t.id));
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {value.length ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {value.map((t) => (
            <Chip key={t.id} label={t.name} icon={<TypeIcon name={t.type?.icon} sx={{ fontSize: 18 }} />} onDelete={() => onChange(value.filter((x) => x.id !== t.id))} sx={{ minHeight: 36, fontWeight: 600 }} />
          ))}
        </Box>
      ) : null}
      <Autocomplete
        options={options}
        loading={loading}
        value={null}
        inputValue={input}
        onInputChange={(_e, v, reason) => reason !== 'reset' && setInput(v)}
        onChange={(_e, t) => {
          if (t) {
            onChange([...value, { id: t.id, name: t.name, type: t.type }]);
            setInput('');
          }
        }}
        filterOptions={(x) => x}
        getOptionLabel={(t) => t?.name ?? ''}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={q ? 'No thing by that name' : 'Type to find a thing'}
        renderInput={(params) => <TextField {...params} label="Linked things" placeholder="The Van, the house…" helperText="A title to its vehicle, a policy to what it covers." />}
      />
    </Box>
  );
}

function PeoplePicker({ people, value, onChange }) {
  const vault = useVault();
  const [name, setName] = useState('');
  const [create, { loading }] = useMutation(CREATE_ATTIC_PERSON, { refetchQueries: [GET_ATTIC_HOME] });
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const add = async () => {
    if (!name.trim()) return;
    try {
      const { data } = await create({ variables: { input: { name: name.trim() } } });
      onChange([...value, data.createAtticPerson.id]);
      setName('');
    } catch (err) {
      vault.handleError(err);
    }
  };
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box role="group" aria-label="Whose document" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {people.map((p) => {
          const on = value.includes(p.id);
          return (
            <ButtonBase
              key={p.id}
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              sx={{ minHeight: 44, px: 1.75, gap: 0.75, borderRadius: '22px', border: '2px solid', borderColor: on ? 'text.primary' : 'border', bgcolor: on ? 'text.primary' : 'background.paper', color: on ? 'background.paper' : 'text.primary', fontWeight: 700, fontSize: '0.9375rem' }}
            >
              {on ? <CheckIcon aria-hidden="true" sx={{ fontSize: 18 }} /> : null}
              {p.name}
            </ButtonBase>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField size="small" label="Someone new" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 120, autoComplete: 'off' }} sx={{ flex: 1 }} />
        <Button onClick={add} disabled={!name.trim() || loading} variant="outlined" sx={{ minHeight: 44, color: 'text.primary', borderColor: 'border' }}>
          Add
        </Button>
      </Box>
    </Box>
  );
}

const fieldsInput = (type, plain) => Object.fromEntries((type?.fields ?? []).filter((f) => !f.identifier).map((f) => [f.key, plain[f.key] ?? '']));

/** The payload createAtticDocument / updateAtticDocument get (exported: the gateway parity fixture copies it). */
export function documentInputFrom({ type, personIds, title, plain, issued, expires, links, notes }, { create }) {
  const input = {
    personIds,
    title: title.trim() || null,
    fields: fieldsInput(type, plain),
    issued: type?.issuedLabel ? calendarDateToUtcIso(issued) : null,
    expires: type?.expiryLabel ? calendarDateToUtcIso(expires) : null,
    links: links.map((t) => t.id),
    notes: notes.trim(),
  };
  return create ? { typeId: type.id, ...input } : input;
}

function DocumentForm({ existing }) {
  const navigate = useNavigate();
  const client = useApolloClient();
  const vault = useVault();
  const { notify } = useToast();
  const [params] = useSearchParams();
  const { data, loading, error } = useQuery(GET_ATTIC_HOME, { fetchPolicy: 'cache-and-network' });
  useLockOnError(error);
  const types = useMemo(() => data?.atticDocumentTypes ?? [], [data]);
  const people = useMemo(() => data?.atticPeople ?? [], [data]);

  const [typeId, setTypeId] = useState(existing?.type?.id ?? null);
  const wantedType = params.get('type');
  const type = types.find((t) => t.id === typeId) ?? (wantedType ? types.find((t) => t.key === wantedType || t.id === wantedType) : null) ?? null;
  const [personIds, setPersonIds] = useState(() => existing?.people?.map((p) => p.id) ?? (params.get('person') ? [params.get('person')] : []));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [plain, setPlain] = useState(() => Object.fromEntries((existing?.fields ?? []).map((f) => [f.key, f.kind === 'date' ? utcIsoToInputValue(f.value) : f.value ?? ''])));
  const [secret, setSecret] = useState({});
  const [issued, setIssued] = useState(utcIsoToInputValue(existing?.issued));
  const [expires, setExpires] = useState(utcIsoToInputValue(existing?.expires));
  const [links, setLinks] = useState(existing?.links ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [files, setFiles] = useState({});
  const [saving, setSaving] = useState(null);
  const [create] = useMutation(CREATE_ATTIC_DOCUMENT);
  const [update] = useMutation(UPDATE_ATTIC_DOCUMENT);

  const identifierFields = (type?.fields ?? []).filter((f) => f.identifier);
  const plainFields = (type?.fields ?? []).filter((f) => !f.identifier);
  const onFile = new Map((existing?.identifiers ?? []).map((i) => [i.key, i.hasValue]));
  const slots = captureSlotsFor(type);

  if (error && !data) return <GeekErrorState title="This didn't load" description="The server didn't answer." sx={{ py: 6 }} />;
  if (loading && !data) return <CircularProgress size={24} aria-label="Loading" />;

  const save = async (e) => {
    e?.preventDefault();
    if (!type) return;
    setSaving({ step: 'Saving the document…', progress: null });
    let id = existing?.id ?? null;
    try {
      const input = documentInputFrom({ type, personIds, title, plain, issued, expires, links, notes }, { create: !existing });
      if (existing) await update({ variables: { id, input } });
      else id = (await create({ variables: { input } })).data.createAtticDocument.id;

      const values = Object.fromEntries(Object.entries(secret).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, v.trim()]));
      if (Object.keys(values).length) {
        setSaving({ step: 'Sealing the numbers…', progress: null });
        await saveIdentifiers(id, values);
        setSecret({});
      }
      const queue = slots.filter((s) => files[s]).map((s) => ({ side: s, file: files[s] }));
      for (let i = 0; i < queue.length; i += 1) {
        setSaving({ step: `Sealing the ${sideLabelFor(type, queue[i].side).toLowerCase()} (${i + 1} of ${queue.length})…`, progress: 0 });
        await uploadAtticFile(id, queue[i], { onProgress: (p) => setSaving((s) => ({ ...s, progress: p })) });
      }
      await client.refetchQueries({ include: [GET_ATTIC_HOME] }).catch(() => {});
      client.cache.evict({ id: client.cache.identify({ __typename: 'AtticDocument', id }) });
      navigate(atticDocPath(id), { replace: true });
    } catch (err) {
      vault.handleError(err);
      setSaving(null);
      if (id && !existing) {
        notify(`Saved, but not everything made it: ${err?.message || 'try adding it again'}.`, { tone: 'error' });
        navigate(atticDocPath(id), { replace: true });
      } else {
        notify(err?.message || 'That didn’t save.', { tone: 'error' });
      }
    }
  };

  return (
    <Box component="form" onSubmit={save} data-testid="attic-form" sx={{ display: 'grid', gap: 2, maxWidth: 720 }}>
      {!existing ? (
        <Box component="section" aria-labelledby="attic-form-type" sx={panelSx}>
          <SectionHeading id="attic-form-type">What is it?</SectionHeading>
          <Box role="radiogroup" aria-labelledby="attic-form-type" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.25 }}>
            {types.map((t) => {
              const on = type?.id === t.id;
              return (
                <ButtonBase
                  key={t.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTypeId(t.id)}
                  data-type={t.key}
                  sx={{ minHeight: 44, px: 1.5, gap: 0.75, borderRadius: '6px', border: '2px solid', borderColor: on ? 'text.primary' : 'border', bgcolor: on ? 'hero.main' : 'background.paper', color: on ? 'hero.contrastText' : 'text.primary', fontWeight: 700, fontSize: '0.9375rem' }}
                >
                  <AtticTypeIcon name={t.icon} sx={{ fontSize: 20 }} />
                  {t.name}
                </ButtonBase>
              );
            })}
          </Box>
        </Box>
      ) : null}

      {type ? (
        <>
          <Box component="section" aria-labelledby="attic-form-who" sx={panelSx}>
            <SectionHeading id="attic-form-who">Whose is it?</SectionHeading>
            <Box sx={{ mt: 1.25 }}>
              <PeoplePicker people={people} value={personIds} onChange={setPersonIds} />
            </Box>
          </Box>

          {!existing ? (
            <Box component="section" aria-labelledby="attic-form-capture" sx={panelSx}>
              <SectionHeading id="attic-form-capture">{slots.includes('back') ? 'Photograph both sides' : 'Photograph it'}</SectionHeading>
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5, mb: 1.25 }}>
                On a dark table, in good light. Sealed on the server before it is stored; never kept on this phone.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: slots.length > 1 ? '1fr 1fr' : '1fr' }, gap: 1.5 }}>
                {slots.map((s) => (
                  <CaptureSlot key={s} testId={`capture-${s}`} label={sideLabelFor(type, s)} card={s !== 'page'} value={files[s] ?? null} onChange={(f) => setFiles((x) => ({ ...x, [s]: f }))} />
                ))}
              </Box>
            </Box>
          ) : null}

          {identifierFields.length ? (
            <Box component="section" aria-labelledby="attic-form-numbers" sx={panelSx}>
              <SectionHeading id="attic-form-numbers">Numbers</SectionHeading>
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5, mb: 1.25 }}>Encrypted on the server, masked on screen, and every reveal is logged.</Typography>
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {identifierFields.map((f) => (
                  <SecretInput key={f.key} id={`attic-id-${f.key}`} label={f.label} strict={f.strict} onFile={onFile.get(f.key)} value={secret[f.key] ?? ''} onChange={(v) => setSecret((s) => ({ ...s, [f.key]: v }))} />
                ))}
              </Box>
            </Box>
          ) : null}

          <Box component="section" aria-labelledby="attic-form-details" sx={panelSx}>
            <SectionHeading id="attic-form-details">Details</SectionHeading>
            <Box sx={{ display: 'grid', gap: 1.5, mt: 1.25 }}>
              {type.issuedLabel || type.expiryLabel ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  {type.issuedLabel ? <TextField label={type.issuedLabel} type="date" value={issued} onChange={(e) => setIssued(e.target.value)} InputLabelProps={{ shrink: true }} /> : null}
                  {type.expiryLabel ? (
                    <TextField
                      label={type.expiryLabel}
                      type="date"
                      value={expires}
                      onChange={(e) => setExpires(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      helperText={type.expiryWarnDays != null ? `Needs attention warns ${type.expiryWarnDays >= 60 ? `${Math.round(type.expiryWarnDays / 30)} months` : `${type.expiryWarnDays} days`} ahead.` : undefined}
                    />
                  ) : null}
                </Box>
              ) : null}
              {plainFields.map((f) => (
                <PlainField key={f.key} field={f} value={plain[f.key]} onChange={(v) => setPlain((p) => ({ ...p, [f.key]: v }))} />
              ))}
              <TextField label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type.name} inputProps={{ maxLength: 200, autoComplete: 'off' }} />
              <ThingLinks value={links} onChange={setLinks} />
              <TextField
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                minRows={2}
                inputProps={{ maxLength: 5000 }}
                helperText="Where the original is, who to call. Notes aren’t sealed — keep numbers in the number fields."
              />
            </Box>
          </Box>

          {saving ? (
            <Box role="status" aria-live="polite" sx={{ display: 'grid', gap: 0.75 }}>
              <Typography sx={{ fontWeight: 700 }}>{saving.step}</Typography>
              <LinearProgress variant={saving.progress == null ? 'indeterminate' : 'determinate'} value={(saving.progress ?? 0) * 100} />
            </Box>
          ) : null}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', position: { xs: 'sticky', md: 'static' }, bottom: { xs: 'calc(72px + env(safe-area-inset-bottom))', md: 'auto' }, zIndex: 2, py: 1, bgcolor: 'background.default' }}>
            <Button type="submit" variant="contained" disabled={Boolean(saving)} sx={{ ...HERO_BUTTON_SX, flex: { xs: 1, md: 'none' }, px: 4 }} data-testid="attic-save">
              {existing ? 'Save changes' : 'Put it in the Attic'}
            </Button>
            <Button onClick={() => navigate(existing ? atticDocPath(existing.id) : '/attic')} disabled={Boolean(saving)} sx={{ minHeight: 48, color: 'text.primary' }}>
              Cancel
            </Button>
          </Box>
        </>
      ) : (
        <Alert severity="info" icon={false} sx={{ bgcolor: 'background.paper', color: 'text.primary', border: 1, borderColor: 'border' }}>
          Pick what kind of document it is, and the form follows.
        </Alert>
      )}
    </Box>
  );
}

function EditLoader() {
  const { id } = useParams();
  const { data, loading, error } = useQuery(GET_ATTIC_DOCUMENT, { variables: { id }, fetchPolicy: 'network-only' });
  useLockOnError(error);
  if (loading && !data) return <CircularProgress size={24} aria-label="Loading" />;
  if (error || !data?.atticDocument) return <GeekErrorState title="Not in the Attic" description="It may have been deleted." sx={{ py: 6 }} />;
  return <DocumentForm existing={data.atticDocument} />;
}

export default function AtticDocumentForm({ mode = 'add' }) {
  return (
    <AtticGate title={mode === 'edit' ? 'Edit a document' : 'Add a document'}>
      {mode === 'edit' ? <EditLoader /> : <DocumentForm />}
    </AtticGate>
  );
}
