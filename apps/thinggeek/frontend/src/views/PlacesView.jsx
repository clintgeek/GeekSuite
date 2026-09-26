/**
 * `/places` — the place tree: House › Garage › Shelf 2. Each place shows
 * what's kept directly there and in total (everything under it), opens the
 * library filtered to it, and has a ⋯ menu: add a place inside, rename,
 * move under another place (never under itself or its own descendants), and
 * delete — whose confirmation says exactly what happens: children move up a
 * level, things kept there become unplaced.
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, IconButton, ListItemIcon, Menu, MenuItem, TextField, Typography } from '@mui/material';
import {
  AddLocationAltOutlined as AddInsideIcon,
  DeleteOutline as DeleteIcon,
  DriveFileMoveOutlined as MoveIcon,
  EditOutlined as RenameIcon,
  MoreVert as MoreIcon,
  PlaceOutlined as PlaceIcon,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useApolloClient, useMutation } from '@apollo/client';
import { GeekDialog, GeekErrorState, GeekSheet, useToast } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import { PlaceList } from '../components/PlacePicker';
import { CREATE_PLACE, DELETE_PLACE, UPDATE_PLACE } from '../graphql/mutations';
import { GET_PLACES } from '../graphql/queries';
import { resetCounts } from '../graphql/cachePolicies';
import { usePlaces } from '../hooks/useThingMeta';
import { buildPlaceTree, deletePlaceSummary, flattenPlaceTree, placeLabel, subtreeIds } from '../utils/places';
import { libraryLinkWith } from '../utils/libraryFilter';

const REFETCH = { refetchQueries: [{ query: GET_PLACES }], awaitRefetchQueries: true };

export function countsText(place) {
  const direct = place.directCount ?? 0;
  const total = place.totalCount ?? 0;
  if (!total) return 'Empty';
  if (direct === total) return `${total} thing${total === 1 ? '' : 's'}`;
  if (!direct) return `${total} inside`;
  return `${direct} here · ${total} in all`;
}

function NameDialog({ open, title, label = 'Name', initial = '', confirm, onClose, onSubmit, children }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title={title}
      mode="window"
      primaryAction={
        <Button variant="contained" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : confirm}
        </Button>
      }
      secondaryAction={
        <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
          Cancel
        </Button>
      }
    >
      {children}
      <TextField
        autoFocus
        fullWidth
        label={label}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        inputProps={{ maxLength: 120 }}
        sx={{ mt: 1 }}
      />
    </GeekDialog>
  );
}

function PlaceRow({ place, depth, onMenu }) {
  return (
    <Box
      component="li"
      data-testid="place-row"
      data-depth={depth}
      sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 0.5, pl: { xs: depth * 2, sm: depth * 3 }, borderBottom: 1, borderColor: 'divider' }}
    >
      <ButtonBase
        component={RouterLink}
        to={libraryLinkWith('places', place.id)}
        aria-label={`${place.name}: ${countsText(place)}. Show in the library`}
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 52, px: 1, borderRadius: 2, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        {depth > 0 ? <Box aria-hidden="true" sx={{ width: 12, height: 12, borderLeft: 2, borderBottom: 2, borderColor: 'border', borderBottomLeftRadius: 4, mt: -1, flexShrink: 0 }} /> : null}
        <PlaceIcon aria-hidden="true" sx={{ fontSize: 20, color: depth ? 'text.secondary' : 'primary.main', flexShrink: 0 }} />
        <Typography noWrap sx={{ fontWeight: depth ? 600 : 700, fontSize: '0.9375rem', color: 'text.primary' }}>
          {place.name}
        </Typography>
        <Typography component="span" noWrap sx={{ ml: 'auto', pl: 1, fontSize: '0.8125rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {countsText(place)}
        </Typography>
      </ButtonBase>
      <IconButton aria-label={`${place.name}: more`} aria-haspopup="menu" onClick={(e) => onMenu(e.currentTarget, place)} sx={{ color: 'text.secondary' }}>
        <MoreIcon />
      </IconButton>
    </Box>
  );
}

export default function PlacesView() {
  const client = useApolloClient();
  const { notify } = useToast();
  const { places, placesById, loading, error, refetch } = usePlaces();
  const [menu, setMenu] = useState(null); // { anchor, place }
  const [dialog, setDialog] = useState(null); // { kind: 'add'|'rename'|'move'|'delete', place }
  const [createPlace] = useMutation(CREATE_PLACE, REFETCH);
  const [updatePlace] = useMutation(UPDATE_PLACE, REFETCH);
  const [deletePlace] = useMutation(DELETE_PLACE, REFETCH);
  const rows = useMemo(() => flattenPlaceTree(buildPlaceTree(places)), [places]);
  const target = dialog?.place ?? null;
  const exclude = useMemo(() => (target && dialog?.kind === 'move' ? subtreeIds(places, target.id) : undefined), [places, target, dialog]);

  const open = (kind, place = null) => {
    setMenu(null);
    setDialog({ kind, place });
  };
  const close = () => setDialog(null);
  const fail = (err, fallback) => notify(err?.message || fallback, { tone: 'error' });

  const add = async (name) => {
    try {
      await createPlace({ variables: { input: { name, parentId: target?.id ?? null } } });
      notify(target ? `Added ${name} inside ${target.name}.` : `Added ${name}.`, { tone: 'success' });
    } catch (err) {
      fail(err, "Couldn't add that place.");
      throw err;
    }
  };
  const rename = async (name) => {
    try {
      await updatePlace({ variables: { id: target.id, input: { name } } });
      notify(`Renamed to ${name}.`, { tone: 'success' });
    } catch (err) {
      fail(err, "Couldn't rename it.");
      throw err;
    }
  };
  const moveTo = async (parentId) => {
    try {
      await updatePlace({ variables: { id: target.id, input: { parentId: parentId ?? null } } });
      resetCounts(client);
      const parent = parentId ? placesById.get(parentId) : null;
      notify(`${target.name} is now ${parent ? `inside ${parent.name}` : 'at the top level'}.`, { tone: 'success' });
      close();
    } catch (err) {
      fail(err, "Couldn't move it there.");
    }
  };
  const remove = async () => {
    try {
      const res = await deletePlace({ variables: { id: target.id } });
      if (res.data?.deletePlace?.success === false) throw new Error(res.data.deletePlace.message);
      resetCounts(client);
      notify(`${target.name} deleted.`, { tone: 'success' });
      close();
    } catch (err) {
      fail(err, "Couldn't delete it.");
    }
  };

  let body;
  if (error && !places.length) {
    body = <GeekErrorState title="Places didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 6 }} />;
  } else if (loading) {
    body = <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>Loading places…</Typography>;
  } else if (!rows.length) {
    body = (
      <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
        <PlaceIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} aria-hidden="true" />
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>No places yet</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>Start with the big ones — House, Garage, Truck — then add shelves and drawers inside them.</Typography>
        <Button variant="contained" startIcon={<AddInsideIcon />} onClick={() => open('add')}>
          Add a place
        </Button>
      </Box>
    );
  } else {
    body = (
      <Box component="ul" aria-label="Places" sx={{ m: 0, p: 0 }}>
        {rows.map(({ place, depth }) => (
          <PlaceRow key={place.id} place={place} depth={depth} onMenu={(anchor, p) => setMenu({ anchor, place: p })} />
        ))}
      </Box>
    );
  }

  return (
    <PageFrame maxWidth={820}>
      <PageHeader
        title="Places"
        lede="Where things live. A place can hold other places; a thing in Shelf 2 is also in the Garage and the House."
        actions={
          rows.length ? (
            <Button variant="contained" startIcon={<AddInsideIcon />} onClick={() => open('add')}>
              Add a place
            </Button>
          ) : null
        }
      />
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.card', px: { xs: 0.5, sm: 1 }, py: 0.5 }}>{body}</Box>

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => open('add', menu.place)} sx={{ minHeight: 44 }}>
          <ListItemIcon><AddInsideIcon fontSize="small" /></ListItemIcon>
          Add a place inside
        </MenuItem>
        <MenuItem onClick={() => open('rename', menu.place)} sx={{ minHeight: 44 }}>
          <ListItemIcon><RenameIcon fontSize="small" /></ListItemIcon>
          Rename
        </MenuItem>
        <MenuItem onClick={() => open('move', menu.place)} sx={{ minHeight: 44 }}>
          <ListItemIcon><MoveIcon fontSize="small" /></ListItemIcon>
          Move…
        </MenuItem>
        <MenuItem onClick={() => open('delete', menu.place)} sx={{ minHeight: 44, color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" /></ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      <NameDialog open={dialog?.kind === 'add'} title={target ? `Add a place inside ${target.name}` : 'Add a place'} confirm="Add" onClose={close} onSubmit={add} />
      <NameDialog open={dialog?.kind === 'rename'} title="Rename place" initial={target?.name ?? ''} confirm="Rename" onClose={close} onSubmit={rename} />

      <GeekSheet open={dialog?.kind === 'move'} onClose={close} title={target ? `Move ${target.name}` : 'Move'} description="Choose its new parent. Everything inside it moves along.">
        <Box sx={{ maxHeight: { xs: '50vh', md: 380 }, overflowY: 'auto' }}>
          {target ? <PlaceList value={target.parentId ?? null} onPick={moveTo} exclude={exclude} noneLabel="Top level" /> : null}
        </Box>
      </GeekSheet>

      <GeekDialog
        open={dialog?.kind === 'delete'}
        onClose={close}
        title={target ? `Delete ${target.name}?` : 'Delete place?'}
        mode="window"
        primaryAction={
          <Button variant="contained" color="error" onClick={remove}>
            Delete
          </Button>
        }
        secondaryAction={
          <Button onClick={close} sx={{ color: 'text.secondary' }}>
            Keep it
          </Button>
        }
      >
        {target ? (
          <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.6 }} data-testid="delete-place-summary">
            {deletePlaceSummary(target, places)} The things themselves aren't touched.
          </Typography>
        ) : null}
        {target && placeLabel(target, placesById) !== target.name ? (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 1 }}>{placeLabel(target, placesById)}</Typography>
        ) : null}
      </GeekDialog>
    </PageFrame>
  );
}
