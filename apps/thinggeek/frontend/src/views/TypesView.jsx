/**
 * `/types` — the household's types. A type is data, not code: its name, an
 * icon, and the fields a thing of that type asks for, each with a kind
 * (text, number, date, choice, money, link, yes/no), an optional unit or
 * choices, and two flags:
 *   - identifier — a serial, VIN, hull or registration: masked on screen
 *     until revealed and NEVER sent to an AI provider;
 *   - required.
 * The starter types (Boat, Vehicle, Firearm…) are seeded once and editable.
 * A type still used by a thing can't be deleted (the gateway refuses; this
 * says so before you try).
 */
import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add as AddIcon, ArrowDownward as DownIcon, ArrowUpward as UpIcon, DeleteOutline as RemoveIcon, LockOutlined as LockIcon } from '@mui/icons-material';
import { useApolloClient, useMutation } from '@apollo/client';
import { GeekDialog, GeekErrorState, useToast } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import TypeIcon from '../components/TypeIcon';
import { DEFAULT_TYPE_ICON, TYPE_ICON_NAMES } from '../components/typeIcons';
import { CREATE_THING_TYPE, DELETE_THING_TYPE, UPDATE_THING_TYPE } from '../graphql/mutations';
import { GET_THING_TYPES } from '../graphql/queries';
import { resetCounts } from '../graphql/cachePolicies';
import { useThingTypes, useVocabulary } from '../hooks/useThingMeta';
import { move } from './edit/MediaEditor';
import { fieldKindLabel } from '../utils/vocab';
import { DISPLAY_FONT } from '../theme/theme';

const REFETCH = { refetchQueries: [{ query: GET_THING_TYPES }], awaitRefetchQueries: true };
const UNIT_KINDS = new Set(['text', 'number']);

/** "Hull number" → "hullNumber", unique among `taken`. */
export function fieldKeyFor(label, taken = new Set()) {
  const words = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let base = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('') || 'field';
  if (/^[0-9]/.test(base)) base = `f${base}`;
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}${n++}`;
  return key;
}

let tmp = 0;
const blankField = () => {
  tmp += 1;
  return { tmpKey: `new-${tmp}`, key: '', label: '', kind: 'text', choicesText: '', unit: '', identifier: false, required: false, isNew: true };
};

export function typeToForm(type) {
  return {
    name: type?.name ?? '',
    icon: type?.icon ?? DEFAULT_TYPE_ICON,
    fields: (type?.fields ?? []).map((f) => ({ ...f, tmpKey: f.key, choicesText: (f.choices ?? []).join(', '), unit: f.unit ?? '', isNew: false })),
  };
}

/** The form → `ThingTypeInput`. New fields get a key from their label; existing keys never change. */
export function formToTypeInput(form) {
  const taken = new Set(form.fields.filter((f) => !f.isNew).map((f) => f.key));
  const fields = form.fields
    .filter((f) => f.label.trim())
    .map((f) => {
      const key = f.isNew ? fieldKeyFor(f.label, taken) : f.key;
      taken.add(key);
      const choices = f.kind === 'choice' ? [...new Set(f.choicesText.split(',').map((c) => c.trim()).filter(Boolean))] : [];
      return {
        key,
        label: f.label.trim(),
        kind: f.kind,
        choices,
        unit: UNIT_KINDS.has(f.kind) && f.unit.trim() ? f.unit.trim() : null,
        identifier: f.kind === 'text' ? Boolean(f.identifier) : false,
        required: Boolean(f.required),
      };
    });
  return { name: form.name.trim(), icon: form.icon, fields };
}

function FieldEditor({ field, index, count, kinds, onChange, onMove, onRemove }) {
  const set = (patch) => onChange({ ...field, ...patch });
  const n = index + 1;
  return (
    <Box component="li" data-testid="type-field-row" sx={{ listStyle: 'none', p: 1.5, borderRadius: 2, border: 1, borderColor: field.identifier ? 'primary.main' : 'divider', bgcolor: 'background.card' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 150px 120px' }, gap: { xs: 2, sm: 1.25 }, pt: 0.75 }}>
        <TextField size="small" label={`Field ${n} label`} value={field.label} onChange={(e) => set({ label: e.target.value })} placeholder="Serial number" inputProps={{ maxLength: 80 }} />
        <TextField select size="small" label="Kind" value={field.kind} onChange={(e) => set({ kind: e.target.value, identifier: e.target.value === 'text' ? field.identifier : false })}>
          {kinds.map((k) => (
            <MenuItem key={k} value={k}>
              {fieldKindLabel(k)}
            </MenuItem>
          ))}
        </TextField>
        {UNIT_KINDS.has(field.kind) ? (
          <TextField size="small" label="Unit" placeholder="ft" value={field.unit} onChange={(e) => set({ unit: e.target.value })} inputProps={{ maxLength: 12 }} />
        ) : (
          <Box sx={{ display: { xs: 'none', sm: 'block' } }} />
        )}
        {field.kind === 'choice' ? (
          <TextField
            size="small"
            label="Choices"
            placeholder="Handgun, Rifle, Shotgun"
            helperText="Separate with commas."
            value={field.choicesText}
            onChange={(e) => set({ choicesText: e.target.value })}
            sx={{ gridColumn: '1 / -1' }}
          />
        ) : null}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
        <FormControlLabel
          control={<Switch checked={field.identifier} disabled={field.kind !== 'text'} onChange={(e) => set({ identifier: e.target.checked })} />}
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.875rem' }}>
              <LockIcon aria-hidden="true" sx={{ fontSize: 16, color: 'text.secondary' }} /> Identifier
            </Box>
          }
          sx={{ mr: 1, minHeight: 44 }}
        />
        <FormControlLabel control={<Switch checked={field.required} onChange={(e) => set({ required: e.target.checked })} />} label={<Box component="span" sx={{ fontSize: '0.875rem' }}>Required</Box>} sx={{ mr: 'auto', minHeight: 44 }} />
        <Tooltip title="Move up">
          <span>
            <IconButton aria-label={`Move field ${n} up`} disabled={index === 0} onClick={() => onMove(-1)} sx={{ color: 'text.secondary' }}>
              <UpIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Move down">
          <span>
            <IconButton aria-label={`Move field ${n} down`} disabled={index === count - 1} onClick={() => onMove(1)} sx={{ color: 'text.secondary' }}>
              <DownIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Remove field">
          <IconButton aria-label={`Remove field ${n}`} onClick={onRemove} sx={{ color: 'text.secondary' }}>
            <RemoveIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {field.identifier ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
          Masked on screen until someone taps Reveal, and never sent to AI. It prints in full on the insurance report.
        </Typography>
      ) : null}
    </Box>
  );
}

export function TypeEditorDialog({ open, type, onClose }) {
  const client = useApolloClient();
  const { notify } = useToast();
  const vocab = useVocabulary();
  const [form, setForm] = useState(() => typeToForm(type));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [createType] = useMutation(CREATE_THING_TYPE, REFETCH);
  const [updateType] = useMutation(UPDATE_THING_TYPE, REFETCH);
  const [deleteType] = useMutation(DELETE_THING_TYPE, REFETCH);
  const isNew = !type?.id;
  const used = type?.thingCount ?? 0;

  useEffect(() => {
    if (open) {
      setForm(typeToForm(type));
      setConfirmDelete(false);
    }
  }, [open, type]);

  const setField = (i, next) => setForm((f) => ({ ...f, fields: f.fields.map((x, j) => (j === i ? next : x)) }));

  const save = async () => {
    if (!form.name.trim()) {
      notify('A type needs a name.', { tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const input = formToTypeInput(form);
      if (isNew) await createType({ variables: { input } });
      else await updateType({ variables: { id: type.id, input } });
      resetCounts(client);
      notify(isNew ? `${input.name} added.` : `${input.name} saved.`, { tone: 'success' });
      onClose();
    } catch (err) {
      notify(err?.message || "That didn't save.", { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteType({ variables: { id: type.id } });
      if (res.data?.deleteThingType?.success === false) throw new Error(res.data.deleteThingType.message);
      notify(`${type.name} deleted.`, { tone: 'success' });
      onClose();
    } catch (err) {
      notify(err?.message || `${type.name} is still in use, so it can't be deleted.`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title={isNew ? 'New type' : `Edit ${type.name}`}
      maxWidth="md"
      primaryAction={
        <Button variant="contained" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      }
      secondaryAction={
        <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
          Cancel
        </Button>
      }
      bodySx={{ pt: 2.5 }}
    >
      <Box data-testid="type-editor">
        <TextField fullWidth label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} inputProps={{ maxLength: 60 }} placeholder="Trailer" />

        <Typography component="h3" id="type-icon-label" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mt: 3, mb: 1 }}>
          Icon
        </Typography>
        <Box role="radiogroup" aria-labelledby="type-icon-label" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 0.5 }}>
          {TYPE_ICON_NAMES.map((name) => {
            const on = form.icon === name;
            return (
              <ButtonBase
                key={name}
                role="radio"
                aria-checked={on ? 'true' : 'false'}
                aria-label={name.replace(/([a-z])([A-Z0-9])/g, '$1 $2')}
                onClick={() => setForm((f) => ({ ...f, icon: name }))}
                sx={{ width: 44, height: 44, borderRadius: '10px', border: on ? 2 : 1, borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'action.selected' : 'transparent', color: on ? 'primary.main' : 'text.secondary' }}
              >
                <TypeIcon name={name} sx={{ fontSize: 22 }} />
              </ButtonBase>
            );
          })}
        </Box>

        <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mt: 3, mb: 0.5 }}>
          Fields
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 1.5 }}>
          What a {form.name.trim() ? form.name.trim().toLowerCase() : 'thing of this type'} asks for. Turn on <b>Identifier</b> for serials, VINs, hull and registration numbers — they're masked on screen and never sent to AI.
        </Typography>
        <Box component="ol" sx={{ m: 0, p: 0, display: 'grid', gap: 1 }}>
          {form.fields.map((f, i) => (
            <FieldEditor
              key={f.tmpKey}
              field={f}
              index={i}
              count={form.fields.length}
              kinds={vocab.fieldKinds}
              onChange={(next) => setField(i, next)}
              onMove={(d) => setForm((x) => ({ ...x, fields: move(x.fields, i, d) }))}
              onRemove={() => setForm((x) => ({ ...x, fields: x.fields.filter((_, j) => j !== i) }))}
            />
          ))}
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => setForm((f) => ({ ...f, fields: [...f.fields, blankField()] }))} sx={{ mt: 1, color: 'text.primary' }}>
          Add a field
        </Button>

        {!isNew ? (
          <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            {used > 0 ? (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }} data-testid="type-delete-refused">
                {type.name} is used by {used} thing{used === 1 ? '' : 's'}, so it can't be deleted. Move {used === 1 ? 'it' : 'them'} to another type first.
              </Typography>
            ) : confirmDelete ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.875rem', flex: 1 }}>Delete {type.name}? Nothing uses it.</Typography>
                <Button onClick={() => setConfirmDelete(false)} sx={{ color: 'text.secondary' }}>
                  Keep it
                </Button>
                <Button variant="contained" color="error" onClick={remove} disabled={busy}>
                  Delete type
                </Button>
              </Box>
            ) : (
              <Button color="error" startIcon={<RemoveIcon />} onClick={() => setConfirmDelete(true)}>
                Delete this type
              </Button>
            )}
          </Box>
        ) : null}
      </Box>
    </GeekDialog>
  );
}

export default function TypesView() {
  const { types, loading, error, refetch } = useThingTypes();
  const [editing, setEditing] = useState(null); // a type, {} for new, or null

  return (
    <PageFrame maxWidth={960}>
      <PageHeader
        title="Types"
        lede="What kinds of things the household keeps, and what each one asks for. Edit a starter type or make your own."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({})}>
            New type
          </Button>
        }
      />
      {error && !types.length ? (
        <GeekErrorState title="Types didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 6 }} />
      ) : loading ? (
        <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>Loading types…</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {types.map((t) => {
            const masked = t.fields.filter((f) => f.identifier);
            return (
              <Box component="li" key={t.id}>
                <ButtonBase
                  onClick={() => setEditing(t)}
                  data-testid="type-row"
                  aria-label={`Edit ${t.name}`}
                  sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.card', textAlign: 'left', justifyContent: 'flex-start', '&:hover': { borderColor: 'primary.main' } }}
                >
                  <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: 'plate.ground', color: 'plate.icon' }}>
                    <TypeIcon name={t.icon} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '1.0625rem', color: 'text.primary' }}>{t.name}</Typography>
                      {t.builtIn ? <Chip label="Starter" size="small" variant="outlined" sx={{ height: 22, color: 'text.secondary', borderColor: 'border' }} /> : null}
                    </Box>
                    <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.25 }}>
                      {t.fields.length ? t.fields.map((f) => f.label).join(', ') : 'No fields — just the basics'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.75, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <span>
                        {t.thingCount} thing{t.thingCount === 1 ? '' : 's'}
                      </span>
                      {masked.length ? (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                          <LockIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                          {masked.map((f) => f.label).join(', ')} masked
                        </Box>
                      ) : null}
                    </Typography>
                  </Box>
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      )}
      <TypeEditorDialog open={Boolean(editing)} type={editing?.id ? editing : null} onClose={() => setEditing(null)} />
    </PageFrame>
  );
}
