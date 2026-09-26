/**
 * `/where` — the whole containment tree (DOCS/THINGGEEK_PLAN.md
 * "Containment"; it replaced the Places page). Locations and containers are
 * the tree — House › Garage › Van — each showing how many things are inside
 * it at any depth, and each expandable to the items kept directly in it.
 *
 * A row's name opens that thing's page (its breadcrumb, Contains, Move). Its
 * ⋯ menu: add a thing here (the add flow, already pointed here), add a
 * location inside, rename, move to… (never into itself or its insides), and
 * show everything inside in the library.
 *
 * Below the tree: things that aren't anywhere yet, and things inside
 * something that is in the Trash (they stay put until it is restored; the
 * purge moves them up a level).
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, IconButton, ListItemIcon, Menu, MenuItem, TextField, Typography } from '@mui/material';
import {
  AddLocationAltOutlined as AddInsideIcon,
  Add as AddIcon,
  ChevronRight as CollapsedIcon,
  DriveFileMoveOutlined as MoveIcon,
  EditOutlined as RenameIcon,
  ExpandMore as ExpandedIcon,
  FilterListOutlined as LibraryIcon,
  MoreVert as MoreIcon,
  PlaceOutlined as PlaceIcon,
} from '@mui/icons-material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { GeekDialog, GeekErrorState, useToast } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import TypeIcon from '../components/TypeIcon';
import { MoveSheet } from '../components/WherePicker';
import { thingPath } from '../components/navConfig';
import { useThingActions } from '../hooks/useThingActions';
import { useLocationType, useThingTree } from '../hooks/useThingMeta';
import { libraryLinkWith } from '../utils/libraryFilter';
import { buildTree, bySiblingOrder, countsText, flattenTree, isParentKind, kindOf } from '../utils/where';

function NameDialog({ open, title, label = 'Name', initial = '', confirm, onClose, onSubmit }) {
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
    } catch {
      // onSubmit has said why (a toast); keep the dialog open.
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
      <TextField
        autoFocus
        fullWidth
        label={label}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        inputProps={{ maxLength: 200 }}
        sx={{ mt: 1 }}
      />
    </GeekDialog>
  );
}

const indent = (depth) => ({ xs: depth * 2, sm: depth * 3 });

function NodeRow({ node, depth, items, expanded, onToggle, onMenu }) {
  const location = useLocation();
  const parentish = isParentKind(kindOf(node));
  return (
    <Box component="li" data-testid="where-row" data-depth={depth} data-kind={kindOf(node)} sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, pl: indent(depth) }}>
        {items.length ? (
          <IconButton
            onClick={onToggle}
            aria-expanded={expanded ? 'true' : 'false'}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${items.length} thing${items.length === 1 ? '' : 's'} kept directly in ${node.name}`}
            data-testid="where-expand"
            sx={{ color: 'text.secondary' }}
          >
            {expanded ? <ExpandedIcon /> : <CollapsedIcon />}
          </IconButton>
        ) : (
          <Box aria-hidden="true" sx={{ width: 40, flexShrink: 0 }} />
        )}
        <ButtonBase
          component={RouterLink}
          to={thingPath(node.id, location.search)}
          aria-label={`${node.name}: ${countsText(node)}. Open`}
          sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 52, px: 1, borderRadius: 2, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
        >
          <TypeIcon name={node.type?.icon ?? 'Place'} sx={{ fontSize: 20, color: depth || !parentish ? 'text.secondary' : 'primary.main', flexShrink: 0 }} />
          <Typography noWrap sx={{ fontWeight: depth ? 600 : 700, fontSize: '0.9375rem', color: 'text.primary' }}>
            {node.name}
          </Typography>
          {kindOf(node) === 'container' && node.type?.name ? (
            <Typography component="span" noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary', display: { xs: 'none', sm: 'inline' } }}>
              {node.type.name}
            </Typography>
          ) : null}
          <Typography component="span" noWrap sx={{ ml: 'auto', pl: 1, fontSize: '0.8125rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {countsText(node)}
          </Typography>
        </ButtonBase>
        <IconButton aria-label={`${node.name}: more`} aria-haspopup="menu" onClick={(e) => onMenu(e.currentTarget, node)} sx={{ color: 'text.secondary' }}>
          <MoreIcon />
        </IconButton>
      </Box>
      {expanded && items.length ? (
        <Box component="ul" aria-label={`Kept directly in ${node.name}`} sx={{ m: 0, p: 0, pb: 0.5 }}>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} depth={depth + 1} onMenu={onMenu} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function ItemRow({ item, depth, onMenu }) {
  const location = useLocation();
  return (
    <Box component="li" data-testid="where-item" sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 0.25, pl: indent(depth) }}>
      <Box aria-hidden="true" sx={{ width: 40, flexShrink: 0 }} />
      <ButtonBase
        component={RouterLink}
        to={thingPath(item.id, location.search)}
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 44, px: 1, borderRadius: 2, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <TypeIcon name={item.type?.icon ?? 'Inventory2'} sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography noWrap sx={{ fontSize: '0.875rem', color: 'text.primary' }}>
          {item.name}
        </Typography>
        {item.childCount ? (
          <Typography component="span" noWrap sx={{ ml: 'auto', pl: 1, fontSize: '0.75rem', color: 'text.secondary', flexShrink: 0 }}>
            {item.childCount} inside
          </Typography>
        ) : null}
      </ButtonBase>
      <IconButton aria-label={`${item.name}: more`} aria-haspopup="menu" onClick={(e) => onMenu(e.currentTarget, item)} sx={{ color: 'text.secondary' }}>
        <MoreIcon />
      </IconButton>
    </Box>
  );
}

function Group({ title, lede, items, onMenu, testId }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <Box data-testid={testId} sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.card', px: { xs: 0.5, sm: 1 }, py: 0.5 }}>
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open ? 'true' : 'false'}
        sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, minHeight: 52, px: 1, borderRadius: 2, justifyContent: 'flex-start', textAlign: 'left' }}
      >
        {open ? <ExpandedIcon sx={{ color: 'text.secondary' }} /> : <CollapsedIcon sx={{ color: 'text.secondary' }} />}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>
            {title} · {items.length}
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{lede}</Typography>
        </Box>
      </ButtonBase>
      {open ? (
        <Box component="ul" sx={{ m: 0, p: 0, pb: 0.5 }}>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} depth={0} onMenu={onMenu} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export default function WhereView() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { nodes, loading, error, refetch } = useThingTree();
  const { createThing, updateThing } = useThingActions();
  const locationType = useLocationType();
  const [expanded, setExpanded] = useState(() => new Set());
  const [menu, setMenu] = useState(null); // { anchor, node }
  const [dialog, setDialog] = useState(null); // { kind: 'add'|'rename'|'move', node }

  const { rows, itemsByParent, nowhere, inTrash } = useMemo(() => {
    const live = nodes.filter((n) => !n.parentInTrash);
    const tree = flattenTree(buildTree(live, (n) => isParentKind(kindOf(n))));
    const inTree = new Set(tree.map((r) => r.node.id));
    const byParent = new Map();
    const loose = [];
    for (const n of live) {
      if (isParentKind(kindOf(n))) continue;
      if (n.parentId && inTree.has(n.parentId)) {
        if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
        byParent.get(n.parentId).push(n);
      } else if (!n.parentId) {
        loose.push(n);
      }
    }
    for (const list of byParent.values()) list.sort(bySiblingOrder);
    return {
      rows: tree,
      itemsByParent: byParent,
      nowhere: loose.sort(bySiblingOrder),
      inTrash: nodes.filter((n) => n.parentInTrash).sort(bySiblingOrder),
    };
  }, [nodes]);

  const target = dialog?.node ?? null;
  const open = (kind, node = null) => {
    setMenu(null);
    setDialog({ kind, node });
  };
  const close = () => setDialog(null);
  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addLocation = async (name) => {
    try {
      await createThing({ name, typeId: locationType.id, parentId: target?.id ?? null }, { search: '' });
      notify(target ? `Added ${name} inside ${target.name}.` : `Added ${name}.`, { tone: 'success' });
    } catch (err) {
      notify(err?.message || "Couldn't add that location.", { tone: 'error' });
      throw err;
    }
  };
  const rename = async (name) => {
    try {
      await updateThing(target.id, { name });
      notify(`Renamed to ${name}.`, { tone: 'success' });
    } catch (err) {
      notify(err?.message || "Couldn't rename it.", { tone: 'error' });
      throw err;
    }
  };
  const addHere = (node) => {
    setMenu(null);
    navigate('/add', { state: { parentId: node.id } });
  };

  let body;
  if (error && !nodes.length) {
    body = <GeekErrorState title="Where didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 6 }} />;
  } else if (loading) {
    body = <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>Loading…</Typography>;
  } else if (!rows.length) {
    body = (
      <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
        <PlaceIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} aria-hidden="true" />
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Nowhere yet</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
          Start with the big ones — House, Garage, Shop — then add rooms and shelves inside them. A van or a safe counts too: add it as a thing and it shows up here.
        </Typography>
        {locationType ? (
          <Button variant="contained" startIcon={<AddInsideIcon />} onClick={() => open('add')}>
            Add a location
          </Button>
        ) : null}
      </Box>
    );
  } else {
    body = (
      <Box component="ul" aria-label="Where things are" sx={{ m: 0, p: 0 }}>
        {rows.map(({ node, depth }) => (
          <NodeRow
            key={node.id}
            node={node}
            depth={depth}
            items={itemsByParent.get(node.id) ?? []}
            expanded={expanded.has(node.id)}
            onToggle={() => toggle(node.id)}
            onMenu={(anchor, n) => setMenu({ anchor, node: n })}
          />
        ))}
      </Box>
    );
  }

  const menuNode = menu?.node ?? null;
  const menuIsParent = menuNode ? isParentKind(kindOf(menuNode)) : false;

  return (
    <PageFrame maxWidth={820}>
      <PageHeader
        title="Where"
        lede="Everything that holds something — the house, its rooms and shelves, the van, the safe. Anything in the Van is also in the Garage and the House."
        actions={
          rows.length && locationType ? (
            <Button variant="contained" startIcon={<AddInsideIcon />} onClick={() => open('add')}>
              Add a location
            </Button>
          ) : null
        }
      />
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.card', px: { xs: 0.5, sm: 1 }, py: 0.5 }}>{body}</Box>

      <Group
        testId="where-nowhere"
        title="Not anywhere yet"
        lede="Open one and Move it to where it lives."
        items={nowhere}
        onMenu={(anchor, n) => setMenu({ anchor, node: n })}
      />
      <Group
        testId="where-in-trash"
        title="Inside something in the Trash"
        lede="They stay put until it's restored. If it's purged, they move up a level."
        items={inTrash}
        onMenu={(anchor, n) => setMenu({ anchor, node: n })}
      />

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {menuIsParent ? (
          <MenuItem onClick={() => addHere(menuNode)} sx={{ minHeight: 44 }}>
            <ListItemIcon>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            Add a thing here
          </MenuItem>
        ) : null}
        {menuIsParent && locationType ? (
          <MenuItem onClick={() => open('add', menuNode)} sx={{ minHeight: 44 }}>
            <ListItemIcon>
              <AddInsideIcon fontSize="small" />
            </ListItemIcon>
            Add a location inside
          </MenuItem>
        ) : null}
        <MenuItem onClick={() => open('rename', menuNode)} sx={{ minHeight: 44 }}>
          <ListItemIcon>
            <RenameIcon fontSize="small" />
          </ListItemIcon>
          Rename
        </MenuItem>
        <MenuItem onClick={() => open('move', menuNode)} sx={{ minHeight: 44 }}>
          <ListItemIcon>
            <MoveIcon fontSize="small" />
          </ListItemIcon>
          Move to…
        </MenuItem>
        {menuNode && (menuNode.childCount ?? 0) > 0 ? (
          <MenuItem component={RouterLink} to={libraryLinkWith('within', menuNode.id)} onClick={() => setMenu(null)} sx={{ minHeight: 44 }}>
            <ListItemIcon>
              <LibraryIcon fontSize="small" />
            </ListItemIcon>
            Show what's inside in the library
          </MenuItem>
        ) : null}
      </Menu>

      <NameDialog
        open={dialog?.kind === 'add'}
        title={target ? `Add a location inside ${target.name}` : 'Add a location'}
        confirm="Add"
        onClose={close}
        onSubmit={addLocation}
      />
      <NameDialog open={dialog?.kind === 'rename'} title={target ? `Rename ${target.name}` : 'Rename'} initial={target?.name ?? ''} confirm="Rename" onClose={close} onSubmit={rename} />
      <MoveSheet open={dialog?.kind === 'move'} onClose={close} thing={target ? { id: target.id, name: target.name, parentId: target.parentId ?? null } : null} />
    </PageFrame>
  );
}
