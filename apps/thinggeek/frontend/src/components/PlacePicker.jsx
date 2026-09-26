/**
 * Pick a place from the tree — and make one on the spot when it isn't there
 * yet ("Shelf 2 … in Garage"), because the moment you're adding the drill is
 * the moment you know where it lives.
 *
 * A button showing the chosen path opens a sheet (bottom sheet on a phone,
 * dialog at md+) with a filter box, the tree in reading order, and an inline
 * "New place" row. Also the "Move under…" picker on the Places page
 * (`exclude` = the place and its descendants, `noneLabel` = "Top level",
 * `allowCreate` off).
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import {
  AddLocationAltOutlined as NewPlaceIcon,
  Check as CheckIcon,
  PlaceOutlined as PlaceIcon,
  Search as SearchIcon,
  UnfoldMore as OpenIcon,
} from '@mui/icons-material';
import { useMutation } from '@apollo/client';
import { GeekSheet, useToast } from '@geeksuite/ui';
import { CREATE_PLACE } from '../graphql/mutations';
import { GET_PLACES } from '../graphql/queries';
import { usePlaces } from '../hooks/useThingMeta';
import { buildPlaceTree, flattenPlaceTree, placeLabel } from '../utils/places';

function Row({ label, depth = 0, selected, onClick, hint, testId }) {
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        onClick={onClick}
        role="option"
        aria-selected={selected ? 'true' : 'false'}
        data-testid={testId}
        sx={{
          width: '100%',
          minHeight: 44,
          pl: 1.5 + depth * 2,
          pr: 1.5,
          gap: 1,
          justifyContent: 'flex-start',
          textAlign: 'left',
          borderRadius: '8px',
          bgcolor: selected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {depth > 0 ? (
          <Box component="span" aria-hidden="true" sx={{ width: 10, height: 1, bgcolor: 'border', flexShrink: 0 }} />
        ) : null}
        <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: '0.9375rem', fontWeight: selected ? 700 : 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </Box>
        {hint ? (
          <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {hint}
          </Box>
        ) : null}
        {selected ? <CheckIcon aria-hidden="true" sx={{ fontSize: 18, color: 'primary.main' }} /> : null}
      </ButtonBase>
    </Box>
  );
}

export function PlaceList({ value, onPick, exclude, allowNone = true, noneLabel = 'No place yet', filterText = '' }) {
  const { places, placesById } = usePlaces();
  const rows = useMemo(() => {
    const flat = flattenPlaceTree(buildPlaceTree(places)).filter((r) => !exclude?.has(r.place.id));
    const q = filterText.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((r) => placeLabel(r.place, placesById).toLowerCase().includes(q)).map((r) => ({ ...r, depth: 0, match: true }));
  }, [places, placesById, exclude, filterText]);

  return (
    <Box component="ul" role="listbox" aria-label="Places" sx={{ m: 0, p: 0 }}>
      {allowNone && !filterText.trim() ? (
        <Row label={noneLabel} selected={!value} onClick={() => onPick(null)} testId="place-none" />
      ) : null}
      {rows.map(({ place, depth, match }) => (
        <Row
          key={place.id}
          label={match ? placeLabel(place, placesById) : place.name}
          depth={depth}
          hint={place.totalCount ? String(place.totalCount) : undefined}
          selected={value === place.id}
          onClick={() => onPick(place.id)}
        />
      ))}
      {!rows.length && filterText.trim() ? (
        <Typography component="li" sx={{ listStyle: 'none', px: 1.5, py: 1.5, fontSize: '0.875rem', color: 'text.secondary' }}>
          No place called “{filterText.trim()}” yet.
        </Typography>
      ) : null}
    </Box>
  );
}

function NewPlaceRow({ initialName = '', defaultParentId = null, onCreated }) {
  const { notify } = useToast();
  const { places, placesById } = usePlaces();
  const [name, setName] = useState(initialName);
  const [parentId, setParentId] = useState(defaultParentId ?? '');
  const [busy, setBusy] = useState(false);
  const [create] = useMutation(CREATE_PLACE, { refetchQueries: [{ query: GET_PLACES }], awaitRefetchQueries: true });
  const ordered = useMemo(() => flattenPlaceTree(buildPlaceTree(places)), [places]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await create({ variables: { input: { name: trimmed, parentId: parentId || null } } });
      const created = res.data?.createPlace;
      notify(`Added ${created ? placeLabel(created, placesById) || trimmed : trimmed}.`, { tone: 'success' });
      setName('');
      if (created) onCreated(created.id);
    } catch (err) {
      notify(err?.message || "Couldn't add that place.", { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); submit(); }} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr auto' }, alignItems: 'center', mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
      <TextField size="small" label="New place" placeholder="Shelf 2" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 120 }} />
      <TextField size="small" select label="Inside" value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <MenuItem value="">Top level</MenuItem>
        {ordered.map(({ place, depth }) => (
          <MenuItem key={place.id} value={place.id} sx={{ pl: 2 + depth * 2 }}>
            {place.name}
          </MenuItem>
        ))}
      </TextField>
      <Button type="submit" variant="outlined" disabled={!name.trim() || busy} startIcon={<NewPlaceIcon />} sx={{ color: 'text.primary' }}>
        {busy ? 'Adding…' : 'Add'}
      </Button>
    </Box>
  );
}

export default function PlacePicker({
  value,
  onChange,
  label = 'Place',
  title = 'Where does it live?',
  exclude,
  allowNone = true,
  noneLabel = 'No place yet',
  allowCreate = true,
  buttonId,
  sx,
}) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const { placesById } = usePlaces();
  const current = value ? placesById.get(value) : null;
  const shown = current ? placeLabel(current, placesById) : noneLabel;

  const pick = (id) => {
    onChange(id);
    setOpen(false);
    setFilterText('');
  };

  return (
    <>
      {/* Reads as an outlined field (so it lines up with the form around it)
          but acts as a button that opens the tree. */}
      <TextField
        id={buttonId}
        label={label}
        value={shown}
        fullWidth
        onClick={() => setOpen(true)}
        InputProps={{
          readOnly: true,
          startAdornment: (
            <InputAdornment position="start">
              <PlaceIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <OpenIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            </InputAdornment>
          ),
          sx: { cursor: 'pointer', '& input': { cursor: 'pointer', color: current ? 'text.primary' : 'text.secondary', textOverflow: 'ellipsis' } },
        }}
        inputProps={{
          role: 'button',
          'aria-haspopup': 'dialog',
          'aria-label': `${label}: ${shown}. Change`,
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          },
        }}
        sx={sx}
      />
      <GeekSheet open={open} onClose={() => setOpen(false)} title={title} snap="content">
        <TextField
          size="small"
          fullWidth
          placeholder="Find a place"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          inputProps={{ 'aria-label': 'Find a place' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
          sx={{ mb: 1 }}
        />
        <Box sx={{ maxHeight: { xs: '45vh', md: 360 }, overflowY: 'auto', mx: -0.5, px: 0.5 }}>
          <PlaceList value={value} onPick={pick} exclude={exclude} allowNone={allowNone} noneLabel={noneLabel} filterText={filterText} />
        </Box>
        {allowCreate ? <NewPlaceRow key={open ? 'open' : 'closed'} initialName={filterText} defaultParentId={value} onCreated={pick} /> : null}
      </GeekSheet>
    </>
  );
}
