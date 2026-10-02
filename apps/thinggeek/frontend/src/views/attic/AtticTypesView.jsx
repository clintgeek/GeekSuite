/**
 * `/attic/types` — the household's document types: what each kind of paper
 * asks for, and how early its expiry warns in Needs attention. Starter types
 * can be tuned (name, warning window); a household's own types can be added
 * with their fields. A field's "number" flag (identifier: sealed, masked,
 * audit-logged) is chosen when the field is added and never flips after.
 */
import React, { useState } from 'react';
import { Box, Button, ButtonBase, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import { Add as AddIcon, ChevronRight as GoIcon, DeleteOutline as RemoveIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@apollo/client';
import { GeekSheet, useToast } from '@geeksuite/ui';
import SectionHeading from '../../components/SectionHeading';
import { CREATE_ATTIC_TYPE, GET_ATTIC_HOME, UPDATE_ATTIC_TYPE } from '../../graphql/attic';
import { useLockOnError, useVault } from '../../hooks/useVault';
import { AtticGate, HERO_BUTTON_SX } from './AtticLock';
import { panelSx } from './AtticParts';
import { AtticTypeIcon } from './atticIcons';

const KINDS = [
  ['text', 'Text'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['url', 'Link'],
];

const keyFrom = (label, taken) => {
  const base = (label.toLowerCase().replace(/[^a-z0-9]+(.)?/g, (_m, c) => (c ? c.toUpperCase() : '')).replace(/^[^a-z]+/, '') || 'field').slice(0, 40);
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}${n}`;
  return key;
};

/** The payload create/updateAtticDocumentType get (exported for the gateway parity fixture). */
export function typeInputFrom({ name, expiryLabel, warnDays, fields }) {
  return {
    name: name.trim(),
    expiryLabel: expiryLabel.trim() || null,
    expiryWarnDays: expiryLabel.trim() && warnDays !== '' ? Number(warnDays) : null,
    fields: fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind, identifier: Boolean(f.identifier), strict: Boolean(f.strict), required: Boolean(f.required), choices: f.choices ?? [] })),
  };
}

function TypeSheet({ open, onClose, type }) {
  const vault = useVault();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [expiryLabel, setExpiryLabel] = useState('');
  const [warnDays, setWarnDays] = useState('');
  const [fields, setFields] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState('text');
  const [newId, setNewId] = useState(false);
  const [create, { loading: c }] = useMutation(CREATE_ATTIC_TYPE, { refetchQueries: [GET_ATTIC_HOME] });
  const [update, { loading: u }] = useMutation(UPDATE_ATTIC_TYPE, { refetchQueries: [GET_ATTIC_HOME] });
  React.useEffect(() => {
    if (!open) return;
    setName(type?.name ?? '');
    setExpiryLabel(type?.expiryLabel ?? (type ? '' : 'Expires'));
    setWarnDays(type?.expiryWarnDays != null ? String(type.expiryWarnDays) : type ? '' : '30');
    setFields(type?.fields ?? []);
    setNewLabel('');
  }, [open, type]);

  const addField = () => {
    if (!newLabel.trim()) return;
    const key = keyFrom(newLabel, new Set(fields.map((f) => f.key)));
    setFields((fs) => [...fs, { key, label: newLabel.trim(), kind: newKind, identifier: newId, strict: false, required: false, choices: [] }]);
    setNewLabel('');
    setNewId(false);
  };

  const save = async (e) => {
    e?.preventDefault();
    const input = typeInputFrom({ name, expiryLabel, warnDays, fields });
    try {
      if (type) await update({ variables: { id: type.id, input } });
      else await create({ variables: { input } });
      onClose();
    } catch (err) {
      vault.handleError(err);
      notify(err?.message || 'That didn’t save.', { tone: 'error' });
    }
  };

  const stored = new Set((type?.fields ?? []).map((f) => f.key));
  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title={type ? `Edit ${type.name}` : 'A new document type'}
      actions={
        <Button type="submit" form="attic-type-form" variant="contained" disabled={!name.trim() || c || u} sx={HERO_BUTTON_SX}>
          Save
        </Button>
      }
    >
      <Box component="form" id="attic-type-form" onSubmit={save} sx={{ display: 'grid', gap: 2, pt: 1 }}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required inputProps={{ maxLength: 80 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <TextField label="Expiry date is called" value={expiryLabel} onChange={(e) => setExpiryLabel(e.target.value)} placeholder="Expires" helperText="Empty: no expiry date." inputProps={{ maxLength: 60 }} />
          <TextField label="Warn this many days ahead" value={warnDays} onChange={(e) => setWarnDays(e.target.value.replace(/\D/g, '').slice(0, 3))} disabled={!expiryLabel.trim()} inputProps={{ inputMode: 'numeric' }} helperText="In Needs attention." />
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Fields</Typography>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {fields.map((f) => (
              <Box component="li" key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 48, borderBottom: 1, borderColor: 'divider' }}>
                <Typography sx={{ flex: 1, fontSize: '0.9375rem', fontWeight: 600 }}>
                  {f.label}
                  <Box component="span" sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8125rem' }}>
                    {' '}
                    · {f.identifier ? 'number (sealed)' : KINDS.find(([k]) => k === f.kind)?.[1] ?? f.kind}
                  </Box>
                </Typography>
                <IconButton aria-label={`Remove ${f.label}`} onClick={() => setFields((fs) => fs.filter((x) => x.key !== f.key))} sx={{ width: 44, height: 44, color: 'text.secondary' }}>
                  <RemoveIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1 }}>
              <TextField size="small" label="New field" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} inputProps={{ maxLength: 80 }} />
              <TextField size="small" select label="Kind" value={newKind} onChange={(e) => setNewKind(e.target.value)} disabled={newId} sx={{ minWidth: 110 }}>
                {KINDS.map(([k, l]) => (
                  <MenuItem key={k} value={k}>
                    {l}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <FormControlLabel control={<Checkbox checked={newId} onChange={(e) => setNewId(e.target.checked)} />} label="It’s a number to seal (policy, member ID…)" />
            <Button onClick={addField} disabled={!newLabel.trim()} startIcon={<AddIcon />} variant="outlined" sx={{ minHeight: 44, color: 'text.primary', borderColor: 'border', justifySelf: 'start' }}>
              Add the field
            </Button>
            {[...stored].some((k) => !fields.some((f) => f.key === k)) ? (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>Removing a field hides it; values already stored stay sealed.</Typography>
            ) : null}
          </Box>
        </Box>
      </Box>
    </GeekSheet>
  );
}

function TypesList() {
  const { data, loading, error } = useQuery(GET_ATTIC_HOME, { fetchPolicy: 'cache-and-network' });
  useLockOnError(error);
  const [sheet, setSheet] = useState({ open: false, type: null });
  const types = data?.atticDocumentTypes ?? [];
  if (loading && !data) return <CircularProgress size={24} aria-label="Loading" />;
  return (
    <Box component="section" aria-labelledby="attic-types-heading" sx={panelSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <SectionHeading id="attic-types-heading" count={types.length}>
          Document types
        </SectionHeading>
        <Button onClick={() => setSheet({ open: true, type: null })} startIcon={<AddIcon />} sx={{ minHeight: 44, color: 'text.primary', fontWeight: 700 }}>
          New type
        </Button>
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {types.map((t) => (
          <Box component="li" key={t.id} sx={{ borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
            <ButtonBase onClick={() => setSheet({ open: true, type: t })} sx={{ width: '100%', minHeight: 56, display: 'flex', gap: 1.5, px: 0.5, justifyContent: 'flex-start', textAlign: 'left' }}>
              <AtticTypeIcon name={t.icon} sx={{ color: 'text.secondary' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{t.name}</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  {[t.expiryLabel ? `${t.expiryLabel}: warns ${t.expiryWarnDays} days ahead` : 'No expiry', `${t.fields.filter((f) => f.identifier).length} sealed number${t.fields.filter((f) => f.identifier).length === 1 ? '' : 's'}`, `${t.documentCount} on file`].join(' · ')}
                </Typography>
              </Box>
              <GoIcon aria-hidden="true" sx={{ color: 'text.secondary' }} />
            </ButtonBase>
          </Box>
        ))}
      </Box>
      <TypeSheet open={sheet.open} type={sheet.type} onClose={() => setSheet({ open: false, type: null })} />
    </Box>
  );
}

export default function AtticTypesView() {
  return (
    <AtticGate title="Document types">
      <TypesList />
    </AtticGate>
  );
}
