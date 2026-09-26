/**
 * Choosing where a thing is — the containment tree (utils/where.js).
 *
 *   WherePicker  a field ("Where it is: House › Garage") that opens a sheet
 *                (bottom sheet on a phone, dialog at md+) with a filter box,
 *                the LOCATIONS AND CONTAINERS in reading order, and an inline
 *                "New location" row — the moment you're adding the drill is
 *                the moment you know where it lives. The add flow and the
 *                editor use it.
 *   MoveSheet    "Move to…": the same list over EVERY live thing (an item
 *                may hold things too — the camera's memory card), minus the
 *                thing itself and everything inside it, which the gateway
 *                would refuse anyway (no cycles). The thing page and the
 *                Where page use it.
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
import { useLocation } from 'react-router-dom';
import { GeekSheet, useToast } from '@geeksuite/ui';
import TypeIcon from './TypeIcon';
import { useThingActions } from '../hooks/useThingActions';
import { useLocationType, useThingTree } from '../hooks/useThingMeta';
import { buildTree, flattenTree, isParentKind, kindOf, nodeLabel, subtreeIds } from '../utils/where';

function Row({ label, icon, depth = 0, selected, onClick, hint, muted, testId }) {
  return (
    // role="none": the listbox's children are the options, not list items.
    <Box component="li" role="none" sx={{ listStyle: 'none' }}>
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
        {depth > 0 ? <Box component="span" aria-hidden="true" sx={{ width: 10, height: 1, bgcolor: 'border', flexShrink: 0 }} /> : null}
        {icon ? <TypeIcon name={icon} sx={{ fontSize: 18, color: muted ? 'text.secondary' : 'primary.main', flexShrink: 0 }} /> : null}
        <Box
          component="span"
          sx={{ flex: 1, minWidth: 0, fontSize: '0.9375rem', fontWeight: selected ? 700 : muted ? 400 : 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
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

/**
 * The list itself. `mode`: 'where' (locations and containers) or 'move'
 * (every live thing). `exclude`: ids that may not be picked (a thing and its
 * insides). A filter shows matches flat, each with its whole path.
 */
export function WhereList({ value, onPick, exclude, mode = 'where', allowNone = true, noneLabel = 'Nowhere yet', filterText = '' }) {
  const { nodes, nodesById } = useThingTree();
  const rows = useMemo(() => {
    const include = (n) => !exclude?.has(n.id) && (mode === 'move' || isParentKind(kindOf(n)));
    const flat = flattenTree(buildTree(nodes, include));
    const q = filterText.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((r) => nodeLabel(r.node, nodesById).toLowerCase().includes(q)).map((r) => ({ ...r, depth: 0, match: true }));
  }, [nodes, nodesById, exclude, mode, filterText]);

  return (
    <Box component="ul" role="listbox" aria-label={mode === 'move' ? 'Move inside' : 'Where it is'} sx={{ m: 0, p: 0 }}>
      {allowNone && !filterText.trim() ? <Row label={noneLabel} selected={!value} onClick={() => onPick(null)} testId="where-none" /> : null}
      {rows.map(({ node, depth, match }) => (
        <Row
          key={node.id}
          label={match ? nodeLabel(node, nodesById) : node.name}
          icon={node.type?.icon ?? 'Inventory2'}
          muted={!isParentKind(kindOf(node))}
          depth={depth}
          hint={node.itemCount ? String(node.itemCount) : undefined}
          selected={value === node.id}
          onClick={() => onPick(node.id)}
          testId="where-option"
        />
      ))}
      {!rows.length && filterText.trim() ? (
        <Typography component="li" role="none" sx={{ listStyle: 'none', px: 1.5, py: 1.5, fontSize: '0.875rem', color: 'text.secondary' }}>
          Nothing called “{filterText.trim()}” yet.
        </Typography>
      ) : null}
    </Box>
  );
}

/** Make a new location on the spot, inside any location or container. */
function NewLocationRow({ initialName = '', defaultParentId = null, onCreated }) {
  const { notify } = useToast();
  const location = useLocation();
  const { nodes } = useThingTree();
  const { createThing } = useThingActions();
  const locationType = useLocationType();
  const [name, setName] = useState(initialName);
  const [parentId, setParentId] = useState(defaultParentId ?? '');
  const [busy, setBusy] = useState(false);
  const ordered = useMemo(() => flattenTree(buildTree(nodes, (n) => isParentKind(kindOf(n)))), [nodes]);

  if (!locationType) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const created = await createThing({ name: trimmed, typeId: locationType.id, parentId: parentId || null }, { search: location.search });
      notify(`Added ${trimmed}.`, { tone: 'success' });
      setName('');
      if (created) onCreated(created.id);
    } catch (err) {
      notify(err?.message || "Couldn't add that location.", { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr auto' }, alignItems: 'center', mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}
    >
      <TextField size="small" label="New location" placeholder="Shelf 2" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 200 }} />
      <TextField size="small" select label="Inside" value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <MenuItem value="">Top level</MenuItem>
        {ordered.map(({ node, depth }) => (
          <MenuItem key={node.id} value={node.id} sx={{ pl: 2 + depth * 2 }}>
            {node.name}
          </MenuItem>
        ))}
      </TextField>
      <Button type="submit" variant="outlined" disabled={!name.trim() || busy} startIcon={<NewPlaceIcon />} sx={{ color: 'text.primary' }}>
        {busy ? 'Adding…' : 'Add'}
      </Button>
    </Box>
  );
}

function FilterBox({ value, onChange }) {
  return (
    <TextField
      size="small"
      fullWidth
      placeholder="Find a place"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{ 'aria-label': 'Find a place' }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          </InputAdornment>
        ),
      }}
      sx={{ mb: 1 }}
    />
  );
}

export default function WherePicker({
  value,
  onChange,
  label = 'Where it is',
  title = 'Where is it?',
  exclude,
  allowNone = true,
  noneLabel = 'Nowhere yet',
  allowCreate = true,
  buttonId,
  sx,
}) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const { nodesById } = useThingTree();
  const current = value ? nodesById.get(value) : null;
  const shown = current ? nodeLabel(current, nodesById) : noneLabel;

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
      <GeekSheet open={open} onClose={() => setOpen(false)} title={title} description="Locations and containers — a room, a shelf, the van, the safe." snap="content">
        <FilterBox value={filterText} onChange={setFilterText} />
        <Box sx={{ maxHeight: { xs: '45vh', md: 360 }, overflowY: 'auto', mx: -0.5, px: 0.5 }}>
          <WhereList value={value} onPick={pick} exclude={exclude} allowNone={allowNone} noneLabel={noneLabel} filterText={filterText} />
        </Box>
        {allowCreate ? <NewLocationRow key={open ? 'open' : 'closed'} initialName={filterText} defaultParentId={value} onCreated={pick} /> : null}
      </GeekSheet>
    </>
  );
}

/**
 * "Move to…" for `thing` (`{ id, name, parentId }`). Picks from every live
 * thing but itself and its insides; the move itself is useThingActions'
 * moveThing, whose errors (a cycle, too deep, a parent just trashed) are
 * shown as the gateway words them.
 */
export function MoveSheet({ open, onClose, thing, onMoved }) {
  const { notify } = useToast();
  const location = useLocation();
  const { nodes, nodesById } = useThingTree();
  const { moveThing } = useThingActions();
  const [filterText, setFilterText] = useState('');
  const [busy, setBusy] = useState(false);
  const exclude = useMemo(() => (thing ? subtreeIds(nodes, thing.id) : new Set()), [nodes, thing]);

  const pick = async (parentId) => {
    if (!thing || busy) return;
    if ((parentId ?? null) === (thing.parentId ?? null)) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await moveThing(thing.id, parentId, { search: location.search });
      const parent = parentId ? nodesById.get(parentId) : null;
      notify(`${thing.name} is now ${parent ? `in ${parent.name}` : 'at the top level'}.`, { tone: 'success' });
      setFilterText('');
      onMoved?.(parentId);
      onClose();
    } catch (err) {
      notify(err?.message || "Couldn't move it there.", { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title={thing ? `Move ${thing.name} to…` : 'Move to…'}
      description="Everything inside it moves along."
      snap="content"
    >
      <FilterBox value={filterText} onChange={setFilterText} />
      <Box sx={{ maxHeight: { xs: '50vh', md: 380 }, overflowY: 'auto', mx: -0.5, px: 0.5 }} data-testid="move-list">
        {thing ? <WhereList mode="move" value={thing.parentId ?? null} onPick={pick} exclude={exclude} noneLabel="Top level" filterText={filterText} /> : null}
      </Box>
    </GeekSheet>
  );
}
