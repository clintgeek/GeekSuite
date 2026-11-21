/**
 * Edit everything about a thing, in one form: the basics, the type's own
 * fields (by kind), value and purchase, dates, relationships, the photos and
 * documents already on it, and notes. Full-screen on a phone (GeekDialog).
 *
 * `focus` ('details' | 'value' | 'dates' | 'relationships' | 'notes') opens
 * the form scrolled to that section with its first field focused — the
 * one-tap fixes on the thing's page ("Record the serial") land here.
 *
 * `thingToForm` / `formToInput` are the whole mapping, pure and exported.
 *
 * Works like Add (2026-11-18): the kraft floor with cream fields, the livery
 * band under the header, and Save in a black bar at the foot (in reach of the
 * thumb on a phone, at the bottom of the dialog on a desktop) — not in the
 * header's top-right corner. A changed form asks before it goes (the shared
 * useUnsavedGuard: ✕, Cancel, Escape, Android Back, reload).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import { useApolloClient } from '@apollo/client';
import { GeekDialog, useToast, useUnsavedGuard } from '@geeksuite/ui';
import ChromeTheme from '../../components/Chrome';
import { CHROME, LIVERY, LIVERY_SHEET_HEADER_SX, dustImage } from '../../theme/theme';
import WherePicker from '../../components/WherePicker';
import TagInput from '../../components/TagInput';
import TypeIcon from '../../components/TypeIcon';
import { useThingActions } from '../../hooks/useThingActions';
import { useUploads } from '../../hooks/useUploads';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import { GET_THING } from '../../graphql/queries';
import { useThingTree, useThingTypes, useVocabulary } from '../../hooks/useThingMeta';
import { subtreeIds } from '../../utils/where';
import { attributeToForm, buildAttributePatch } from '../../utils/attributes';
import { calendarDateToUtcIso, utcIsoToInputValue } from '../../utils/dates';
import { moneyAmount, parseMoneyInput } from '../../utils/money';
import { hasValue } from '../../utils/identifiers';
import AttributeField from './AttributeField';
import DatesEditor from './DatesEditor';
import MediaEditor from './MediaEditor';
import RelationshipsEditor from './RelationshipsEditor';

const moneyText = (v) => {
  const n = moneyAmount(v);
  return n === null ? '' : String(n);
};

export function thingToForm(thing) {
  const attrs = {};
  for (const f of thing?.fields ?? []) attrs[f.key] = attributeToForm(f, f.value);
  // Raw attributes the rendered fields don't cover survive a type switch back.
  for (const [k, v] of Object.entries(thing?.attributes ?? {})) if (!(k in attrs) && v !== null && typeof v !== 'object') attrs[k] = String(v);
  return {
    name: thing?.name ?? '',
    typeId: thing?.type?.id ?? '',
    parentId: thing?.parentId ?? null,
    originalParentId: thing?.parentId ?? null,
    tags: thing?.tags ?? [],
    attrs,
    valueAmount: moneyText(thing?.value),
    valueAsOf: utcIsoToInputValue(thing?.value?.asOf),
    acquiredDate: utcIsoToInputValue(thing?.acquired?.date),
    acquiredFrom: thing?.acquired?.from ?? '',
    acquiredPrice: moneyText(thing?.acquired?.price),
    dates: (thing?.dates ?? []).map((d) => ({
      key: d.id,
      id: d.id,
      kind: d.kind,
      label: d.label ?? '',
      date: utcIsoToInputValue(d.date),
      recurEveryMonths: d.recurEveryMonths ?? 0,
      notes: d.notes ?? '',
    })),
    relationships: (thing?.relationships ?? [])
      .filter((r) => r.direction !== 'in')
      .map((r) => ({ key: r.id, kind: r.kind, thing: r.thing })),
    photos: (thing?.photos ?? []).map((p) => ({ ...p, removed: false })),
    documents: (thing?.documents ?? []).map((d) => ({ ...d, removed: false })),
    notes: thing?.notes ?? '',
  };
}

const photoInput = (p) => ({ id: p.id, role: p.role, caption: (p.caption ?? '').trim() || null });
const documentInput = (d) => ({ id: d.id, role: d.role, title: (d.title ?? '').trim() || null });

/**
 * One attachment list for `ThingInput` — or `undefined` (leave it alone).
 *
 * The gateway REPLACES photos/documents with the list sent, and an upload
 * that finishes while the dialog is open is not in the form (it was seeded
 * on open). Sending the seeded list back would detach that photo, silently
 * (SUITE_REVIEW_2026-11 ThingGeek finding 1). So:
 *   - untouched (same ids, order, roles, text as when the dialog opened) →
 *     not sent at all; the gateway keeps whatever the thing has now;
 *   - changed → the form's list, plus every attachment in `latest` (the
 *     freshest read of the thing) that the form never saw, as it is.
 */
export function attachmentListInput(formList, seededList, latestList, toInput) {
  const current = formList.filter((a) => !a.removed).map(toInput);
  if (!seededList) return current;
  const seeded = seededList.map(toInput);
  if (JSON.stringify(current) === JSON.stringify(seeded)) return undefined;
  const known = new Set(seededList.map((a) => a.id));
  const arrived = (latestList ?? []).filter((a) => a?.id && !known.has(a.id)).map(toInput);
  return [...current, ...arrived];
}

/**
 * The form → `ThingInput`. Arrays replace whole; `attributes` is a PATCH
 * (the gateway merges: changed keys only, null clears) against `original`,
 * the thing's stored attribute map.
 *
 * `media.seeded` (the thing as the dialog opened on it) and `media.latest`
 * (the freshest read) make photos/documents safe against uploads landing
 * underneath — see `attachmentListInput`. Without them both lists are sent.
 */
export function formToInput(form, type, original = {}, media = {}) {
  const value = parseMoneyInput(form.valueAmount);
  const price = parseMoneyInput(form.acquiredPrice);
  const input = {
    name: form.name.trim(),
    typeId: form.typeId || null,
    // Only when it changed: re-sending an unchanged parent would be refused
    // while that parent is in the Trash, and block saving anything else.
    ...((form.parentId || null) !== (form.originalParentId || null) ? { parentId: form.parentId || null } : {}),
    tags: form.tags,
    attributes: buildAttributePatch(type?.fields ?? [], form.attrs, original),
    value: { amount: value, currency: 'USD', asOf: calendarDateToUtcIso(form.valueAsOf) },
    acquired: {
      date: calendarDateToUtcIso(form.acquiredDate),
      from: form.acquiredFrom.trim() || null,
      price: { amount: price, currency: 'USD' },
    },
    dates: form.dates
      .filter((d) => d.date)
      .map((d) => ({
        ...(d.id ? { id: d.id } : {}),
        kind: d.kind,
        label: d.label.trim() || null,
        date: calendarDateToUtcIso(d.date),
        recurEveryMonths: d.recurEveryMonths ? Number(d.recurEveryMonths) : null,
        notes: d.notes.trim() || null,
      })),
    relationships: form.relationships.map((r) => ({ kind: r.kind, thingId: r.thing.id })),
    notes: form.notes,
  };
  const photos = attachmentListInput(form.photos, media.seeded ? media.seeded.photos ?? [] : null, media.latest?.photos, photoInput);
  const documents = attachmentListInput(form.documents, media.seeded ? media.seeded.documents ?? [] : null, media.latest?.documents, documentInput);
  if (photos !== undefined) input.photos = photos;
  if (documents !== undefined) input.documents = documents;
  return input;
}

/** Problems that stop a save, keyed by field. */
export function validateForm(form, type) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'A thing needs a name.';
  for (const f of type?.fields ?? []) {
    if (f.required && !hasValue(form.attrs[f.key]) && form.attrs[f.key] !== true && form.attrs[f.key] !== false) errors[`attr:${f.key}`] = `${f.label} is required for this type.`;
  }
  if (form.valueAmount && parseMoneyInput(form.valueAmount) === null) errors.valueAmount = 'Enter an amount like 1250 or 1,249.99.';
  if (form.acquiredPrice && parseMoneyInput(form.acquiredPrice) === null) errors.acquiredPrice = 'Enter an amount like 1250 or 1,249.99.';
  return errors;
}

function Group({ id, title, hint, children }) {
  return (
    <Box component="section" id={`edit-${id}`} aria-labelledby={`edit-${id}-title`} sx={{ scrollMarginTop: 12, pb: 3, mb: 3, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0, mb: 0 } }}>
      <Typography id={`edit-${id}-title`} component="h3" sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.primary', mb: hint ? 0.5 : 1.5 }}>
        {title}
      </Typography>
      {hint ? <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 2.25 }}>{hint}</Typography> : null}
      {children}
    </Box>
  );
}

/**
 * Room the sticky Save bar takes at the foot of the scrolling body (its 48px
 * buttons, padding and stripe, plus a little air): the body's scroll padding,
 * so a field focused near the bottom scrolls clear of the bar, not under it.
 */
export const EDIT_BAR_CLEARANCE_PX = 88;

const grid2 = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2.25 };

export default function EditThingDialog({ open, onClose, thing, focus }) {
  const { notify } = useToast();
  const vocab = useVocabulary();
  const { types, typesById } = useThingTypes();
  const { nodes } = useThingTree();
  // Not inside itself or anything it holds (the gateway refuses a cycle too).
  const exclude = useMemo(() => (thing?.id ? subtreeIds(nodes, thing.id) : undefined), [nodes, thing?.id]);
  const { updateThing } = useThingActions();
  const [form, setForm] = useState(() => thingToForm(thing));
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const bodyRef = useRef(null);
  // The thing as the form was seeded from it: photos/documents that arrive
  // after this are not the form's to drop (formToInput's `media`).
  const seededRef = useRef(thing);
  const client = useApolloClient();
  const { items: uploads } = useUploads(thing?.id);
  // 'done' items stay listed until the thing has been re-read with them.
  const uploading = uploads.some((u) => u.status !== 'failed');
  // On a phone the keyboard covers the foot of the dialog: the bar docks above it (as Add's does).
  const keyboard = useKeyboardInset();

  // What the form was opened with, to tell an edit from a look.
  const baselineRef = useRef(null);
  useEffect(() => {
    if (open) {
      const seeded = thingToForm(thing);
      setForm(seeded);
      baselineRef.current = JSON.stringify(seeded);
      seededRef.current = thing;
      setShowErrors(false);
    }
    // Re-seed only when the dialog opens; the thing can update underneath
    // (an upload finishing) without wiping what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !focus) return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById(`edit-${focus}`);
      el?.scrollIntoView?.({ block: 'start' });
      const target = focus === 'details' ? el?.querySelector('input[data-identifier="true"]') ?? el?.querySelector('input, textarea') : el?.querySelector('input, textarea');
      target?.focus?.({ preventScroll: true });
    }, 320);
    return () => clearTimeout(t);
  }, [open, focus]);

  // Before the types list arrives, the thing's own rendered fields stand in for its type's.
  const type = useMemo(
    () =>
      typesById.get(form.typeId) ??
      (thing?.type?.id === form.typeId ? { ...thing.type, fields: (thing.fields ?? []).map((f) => ({ ...f, choices: f.choices ?? [], required: false })) } : null),
    [typesById, form.typeId, thing]
  );
  const errors = useMemo(() => validateForm(form, type), [form, type]);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setAttr = (key) => (value) => setForm((f) => ({ ...f, attrs: { ...f.attrs, [key]: value } }));
  const err = (key) => (showErrors ? errors[key] : undefined);

  const droppedOnSwitch = useMemo(() => {
    if (!type || !thing?.type || thing.type.id === form.typeId) return [];
    const keep = new Set((type.fields ?? []).map((f) => f.key));
    return (thing.fields ?? []).filter((f) => hasValue(f.value) && !keep.has(f.key)).map((f) => f.label);
  }, [type, thing, form.typeId]);

  const dirty = open && baselineRef.current !== null && JSON.stringify(form) !== baselineRef.current;
  // Down while saving, so a successful save closes without asking.
  const guard = useUnsavedGuard({ dirty, enabled: open && !busy, onDiscard: onClose });

  const save = async () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      notify(Object.values(errors)[0], { tone: 'warning' });
      return;
    }
    if (uploading) {
      notify('A photo or document is still uploading. Save again when it has finished.', { tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const media = { seeded: seededRef.current ?? thing, latest: thing };
      let input = formToInput(form, type, thing.attributes ?? {}, media);
      if (input.photos || input.documents) {
        // Photos/documents changed: merge against the freshest read, so one
        // another phone uploaded meanwhile is kept too.
        try {
          const res = await client.query({ query: GET_THING, variables: { id: thing.id }, fetchPolicy: 'network-only' });
          if (res?.data?.thing) input = formToInput(form, type, thing.attributes ?? {}, { ...media, latest: res.data.thing });
        } catch {
          /* offline or flaky: the cached thing is the best we know */
        }
      }
      await updateThing(thing.id, input);
      onClose();
      notify('Saved.', { tone: 'success' });
    } catch (e) {
      notify(e?.message || "That didn't save. Try again.", { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeekDialog
      open={open}
      onClose={guard.requestClose}
      title={`Edit ${thing?.name ?? 'thing'}`}
      maxWidth="md"
      sx={{ bgcolor: 'background.desk', backgroundImage: (t) => dustImage(t.palette.mode) }}
      headerSx={{ ...LIVERY_SHEET_HEADER_SX, bgcolor: 'background.desk' }}
      titleSx={LIVERY_SHEET_HEADER_SX}
      bodySx={{ pt: 2.5, pb: 0, px: { xs: 2, sm: 3 }, scrollPaddingBottom: `calc(${keyboard + EDIT_BAR_CLEARANCE_PX}px + env(safe-area-inset-bottom))` }}
    >
      <Box ref={bodyRef} data-testid="edit-form">
        <Group id="basics" title="Basics">
          <Box sx={{ display: 'grid', gap: 2.25, pt: 0.5 }}>
            <TextField label="Name *" value={form.name} onChange={(e) => set('name')(e.target.value)} error={Boolean(err('name'))} helperText={err('name')} inputProps={{ maxLength: 200 }} fullWidth />
            <Box sx={grid2}>
              <TextField
                select
                label="Type"
                value={form.typeId}
                onChange={(e) => set('typeId')(e.target.value)}
                InputProps={{ startAdornment: type ? <InputAdornment position="start"><TypeIcon name={type.icon} sx={{ fontSize: 20, color: 'text.secondary' }} /></InputAdornment> : undefined }}
              >
                {types.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
                {!types.length && thing?.type ? <MenuItem value={thing.type.id}>{thing.type.name}</MenuItem> : null}
              </TextField>
              <WherePicker value={form.parentId} onChange={set('parentId')} exclude={exclude} />
            </Box>
            {droppedOnSwitch.length ? (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                {type?.name} doesn't have {droppedOnSwitch.join(', ')} — {droppedOnSwitch.length === 1 ? 'it is' : 'they are'} dropped when you save.
              </Typography>
            ) : null}
            <TagInput value={form.tags} onChange={set('tags')} />
          </Box>
        </Group>

        <Group id="details" title={type ? `${type.name} details` : 'Details'} hint={type?.fields?.some((f) => f.identifier) ? 'Fields with a lock are identifiers — masked on screen, never sent to AI.' : undefined}>
          {type?.fields?.length ? (
            <Box sx={grid2}>
              {type.fields.map((f) => (
                <AttributeField key={f.key} field={f} value={form.attrs[f.key]} onChange={setAttr(f.key)} error={err(`attr:${f.key}`)} />
              ))}
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>This type has no fields of its own. Add some under Types, or keep details in the notes.</Typography>
          )}
        </Group>

        <Group id="value" title="Value & purchase" hint="The insurance report totals the current value.">
          <Box sx={grid2}>
            <TextField label="Current value" value={form.valueAmount} onChange={(e) => set('valueAmount')(e.target.value)} error={Boolean(err('valueAmount'))} helperText={err('valueAmount')} inputProps={{ inputMode: 'decimal' }} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
            <TextField label="Value as of" type="date" value={form.valueAsOf} onChange={(e) => set('valueAsOf')(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Acquired" type="date" value={form.acquiredDate} onChange={(e) => set('acquiredDate')(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Paid" value={form.acquiredPrice} onChange={(e) => set('acquiredPrice')(e.target.value)} error={Boolean(err('acquiredPrice'))} helperText={err('acquiredPrice')} inputProps={{ inputMode: 'decimal' }} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
            <TextField label="From" placeholder="Bass Pro Shops, Springfield" value={form.acquiredFrom} onChange={(e) => set('acquiredFrom')(e.target.value)} sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 200 }} />
          </Box>
        </Group>

        <Group id="dates" title="Dates" hint="Warranties, registrations, insurance, service. They show in Needs attention when they're close.">
          <DatesEditor rows={form.dates} onChange={set('dates')} kinds={vocab.dateKinds} />
        </Group>

        <Group id="relationships" title="Accessories">
          <RelationshipsEditor
            thingId={thing?.id}
            rows={form.relationships}
            onChange={set('relationships')}
            incoming={(thing?.relationships ?? []).filter((r) => r.direction === 'in')}
            kinds={vocab.relationshipKinds}
          />
        </Group>

        <Group id="photos" title="Photos">
          <MediaEditor kind="photo" rows={form.photos} onChange={set('photos')} roles={vocab.photoRoles} />
        </Group>

        <Group id="documents" title="Documents">
          <MediaEditor kind="document" rows={form.documents} onChange={set('documents')} roles={vocab.documentRoles} />
        </Group>

        <Group id="notes" title="Notes">
          <TextField label="Notes" value={form.notes} onChange={(e) => set('notes')(e.target.value)} multiline minRows={4} fullWidth inputProps={{ maxLength: 10000 }} />
        </Group>
      </Box>
      {/* Add's Save bar: black, the orange stripe along its top, pinned to the foot of the scrolling body. */}
      <ChromeTheme>
        <Box
          data-testid="edit-save-bar"
          sx={{
            position: 'sticky',
            bottom: `${keyboard}px`,
            zIndex: 2,
            mx: { xs: -2, sm: -3 },
            mt: 1,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 1,
            px: 2,
            pt: '14px',
            pb: 'calc(10px + env(safe-area-inset-bottom))',
            bgcolor: CHROME.bar,
            backgroundImage: `linear-gradient(180deg, ${LIVERY.orange} 0 4px, transparent 4px)`,
          }}
        >
          <Button variant="outlined" onClick={guard.requestClose} sx={{ minHeight: 48, color: CHROME.text, borderColor: CHROME.text, fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="hero"
            disableElevation
            onClick={save}
            disabled={busy}
            sx={{ minHeight: 48, fontWeight: 800, border: 2, borderStyle: 'solid', borderColor: 'hero.contrastText' }}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </Box>
      </ChromeTheme>
      {guard.prompt}
    </GeekDialog>
  );
}
