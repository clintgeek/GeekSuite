/**
 * `/where` — where everything is (DOCS/THINGGEEK_PLAN.md "Containment").
 * Place names are Dymo tape: this page is the label maker's home.
 *
 * Phone: a DRILL-DOWN, never an indented tree (indents drift and wrap at
 * 390px). The top level lists the places that aren't inside anything;
 * tapping one shows ITS contents — places first (they drill further), then
 * the things kept there (they open their page) — under a tape breadcrumb
 * back up (WHERE › HOUSE › GARAGE), with "Add here", "Move" and its own
 * page in place. The level lives in the URL (`?at=<id>`), so Back walks back
 * up and a level can be linked to.
 *
 * md+: the whole tree, each place expandable to the things kept directly in
 * it. Every row is the same grid — a fixed indent per level, then a fixed
 * 44px toggle column — so names line up whether or not a row can expand.
 *
 * Either way, a place's ⋯ menu: add a thing here, add a location inside,
 * rename, move to… (never into itself or its insides), and show what's inside
 * in the library. Below: things that aren't anywhere yet, and things inside
 * something in the Trash (they stay put until it's restored).
 */
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Box, Button, ButtonBase, IconButton, ListItemIcon, Menu, MenuItem, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import {
  AddLocationAltOutlined as AddInsideIcon,
  Add as AddIcon,
  ChevronRight as CollapsedIcon,
  DriveFileMoveOutlined as MoveIcon,
  EditOutlined as RenameIcon,
  ExpandMore as ExpandedIcon,
  FilterListOutlined as LibraryIcon,
  MoreVert as MoreIcon,
  OpenInNew as OpenIcon,
  PhotoCameraOutlined as WalkIcon,
  PlaceOutlined as PlaceIcon,
  QrCode2Outlined as LabelIcon,
} from '@mui/icons-material';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { GeekDialog, GeekErrorState, useToast } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import DymoTape from '../components/DymoTape';
import TapeCrumbs from '../components/TapeCrumbs';
import TypeIcon from '../components/TypeIcon';
import { useScrollRoot } from '../components/AppMain';
import { MoveSheet } from '../components/WherePicker';
import { thingPath } from '../components/navConfig';
import { useThingActions } from '../hooks/useThingActions';
import { useLocationType, useThingTree } from '../hooks/useThingMeta';
import { labelsPath } from '../utils/labelUrl';
import { libraryLinkWith } from '../utils/libraryFilter';
import { visuallyHidden } from '../utils/a11y';
import { buildTree, bySiblingOrder, countsText, flattenTree, isParentKind, kindOf } from '../utils/where';

export const WHERE_LEDE = 'Places, and the things that hold things.';

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

// ── Desktop: the tree ────────────────────────────────────────────────────────

/** One indent step, in px, the same at every width (no responsive units: they drift). */
export const INDENT_PX = 24;
const TOGGLE_PX = 44;

function NodeRow({ node, depth, items, expanded, onToggle, onMenu }) {
  const location = useLocation();
  return (
    <Box component="li" data-testid="where-row" data-depth={depth} data-kind={kindOf(node)} sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: `${depth * INDENT_PX}px ${TOGGLE_PX}px minmax(0, 1fr) ${TOGGLE_PX}px`, alignItems: 'center' }}>
        <span aria-hidden="true" />
        {items.length ? (
          <IconButton
            onClick={onToggle}
            aria-expanded={expanded ? 'true' : 'false'}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${items.length} thing${items.length === 1 ? '' : 's'} kept directly in ${node.name}`}
            data-testid="where-expand"
            sx={{ color: 'text.secondary', width: TOGGLE_PX, height: TOGGLE_PX }}
          >
            {expanded ? <ExpandedIcon /> : <CollapsedIcon />}
          </IconButton>
        ) : (
          <span aria-hidden="true" />
        )}
        <ButtonBase
          component={RouterLink}
          to={thingPath(node.id, location.search)}
          aria-label={`${node.name}: ${countsText(node)}. Open`}
          sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 52, px: 1, borderRadius: '6px', justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
        >
          <DymoTape tilt={depth === 0} size={depth === 0 ? 'md' : 'sm'} sx={{ minWidth: 0 }}>
            {node.name}
          </DymoTape>
          {kindOf(node) === 'container' && node.type?.name ? (
            <Typography component="span" noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
              {node.type.name}
            </Typography>
          ) : null}
          <Typography component="span" noWrap sx={{ ml: 'auto', pl: 1, fontSize: '0.8125rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {countsText(node)}
          </Typography>
        </ButtonBase>
        <IconButton aria-label={`${node.name}: more`} aria-haspopup="menu" onClick={(e) => onMenu(e.currentTarget, node)} sx={{ color: 'text.secondary', width: TOGGLE_PX, height: TOGGLE_PX }}>
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
    <Box
      component="li"
      data-testid="where-item"
      sx={{ listStyle: 'none', display: 'grid', gridTemplateColumns: `${depth * INDENT_PX}px ${TOGGLE_PX}px minmax(0, 1fr) ${TOGGLE_PX}px`, alignItems: 'center' }}
    >
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <ButtonBase
        component={RouterLink}
        to={thingPath(item.id, location.search)}
        sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 44, px: 1, borderRadius: '6px', justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <TypeIcon name={item.type?.icon ?? 'Inventory2'} sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography noWrap sx={{ fontSize: '0.9375rem', color: 'text.primary' }}>
          {item.name}
        </Typography>
        {item.childCount ? (
          <Typography component="span" noWrap sx={{ ml: 'auto', pl: 1, fontSize: '0.8125rem', color: 'text.secondary', flexShrink: 0 }}>
            {item.childCount} inside
          </Typography>
        ) : null}
      </ButtonBase>
      <IconButton aria-label={`${item.name}: more`} aria-haspopup="menu" onClick={(e) => onMenu(e.currentTarget, item)} sx={{ color: 'text.secondary', width: TOGGLE_PX, height: TOGGLE_PX }}>
        <MoreIcon />
      </IconButton>
    </Box>
  );
}

function Group({ title, lede, items, onMenu, testId }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <Box data-testid={testId} sx={{ mt: 2, border: 1, borderColor: 'border', borderRadius: '6px', bgcolor: 'background.paper', px: { xs: 0.5, sm: 1 }, py: 0.5 }}>
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open ? 'true' : 'false'}
        sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, minHeight: 52, px: 1, borderRadius: '6px', justifyContent: 'flex-start', textAlign: 'left' }}
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

// ── Phone: the drill-down ────────────────────────────────────────────────────

/** Root → node, walking parents (a missing parent ends the walk). */
export function levelPath(id, byId) {
  const out = [];
  const seen = new Set();
  let cur = id ? byId.get(id) : null;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return out;
}

const whereAt = (id) => (id ? `/where?at=${encodeURIComponent(id)}` : '/where');

function PlaceRow({ node, onMenu }) {
  return (
    <Box component="li" data-testid="where-level-place" sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <ButtonBase
        component={RouterLink}
        to={whereAt(node.id)}
        aria-label={`${node.name}: ${countsText(node)}. Look inside`}
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 60, pl: 1.5, pr: 0.5, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <DymoTape sx={{ maxWidth: '100%' }}>{node.name}</DymoTape>
          <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>
            {[kindOf(node) === 'container' ? node.type?.name : null, countsText(node)].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <CollapsedIcon aria-hidden="true" sx={{ color: 'text.secondary' }} />
      </ButtonBase>
      <IconButton aria-label={`${node.name}: more`} aria-haspopup="menu" onClick={(e) => onMenu(e.currentTarget, node)} sx={{ color: 'text.secondary', mr: 0.5 }}>
        <MoreIcon />
      </IconButton>
    </Box>
  );
}

function ThingLevelRow({ item }) {
  return (
    <Box component="li" data-testid="where-level-item" sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <ButtonBase
        component={RouterLink}
        to={thingPath(item.id)}
        sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 52, px: 1.5, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box aria-hidden="true" sx={{ width: 32, height: 32, borderRadius: '4px', bgcolor: 'plate.ground', color: 'plate.icon', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <TypeIcon name={item.type?.icon ?? 'Inventory2'} sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'text.primary' }}>
            {item.name}
          </Typography>
          <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            {[item.type?.name, item.childCount ? `${item.childCount} inside` : null].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <CollapsedIcon aria-hidden="true" sx={{ color: 'text.secondary' }} />
      </ButtonBase>
    </Box>
  );
}

const sheetSx = { border: 1, borderColor: 'border', borderRadius: '6px', bgcolor: 'background.paper', overflow: 'hidden', boxShadow: '0 2px 6px rgba(40, 25, 10, 0.12)' };

function DrillDown({ at, live, byId, onMenu, onAddHere, onMove, onAddLocation, onWalk, locationType }) {
  const node = at ? byId.get(at) : null;
  const path = node ? levelPath(node.id, byId) : [];
  const children = useMemo(() => {
    if (!node) return live.filter((n) => isParentKind(kindOf(n)) && (!n.parentId || !byId.has(n.parentId))).sort(bySiblingOrder);
    return live.filter((n) => n.parentId === node.id).sort(bySiblingOrder);
  }, [node, live, byId]);
  const places = children.filter((n) => isParentKind(kindOf(n)));
  const things = children.filter((n) => !isParentKind(kindOf(n)));

  return (
    <Box data-testid="where-level" data-at={node?.id ?? ''}>
      {node ? (
        <Box sx={{ mb: 1.5 }}>
          <TapeCrumbs
            path={path}
            hrefFor={(p) => whereAt(p.id)}
            label="Where you are"
            currentLinked={false}
            testId="where-level-crumbs"
            lead={
              <Box component={RouterLink} to="/where" sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, px: 0.5, color: 'text.primary', fontWeight: 700, fontSize: '0.9375rem' }}>
                Where
              </Box>
            }
          />
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.25 }}>
            {[kindOf(node) === 'container' ? node.type?.name : null, countsText(node)].filter(Boolean).join(' · ')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => onAddHere(node)} data-testid="where-add-here">
              Add here
            </Button>
            <Button variant="outlined" startIcon={<WalkIcon />} onClick={() => onWalk(node)} data-testid="where-walk" sx={{ color: 'text.primary', borderColor: 'border' }}>
              Walk this room
            </Button>
            <Button variant="outlined" startIcon={<MoveIcon />} onClick={() => onMove(node)} data-testid="where-move" sx={{ color: 'text.primary', borderColor: 'border' }}>
              Move
            </Button>
            <Button component={RouterLink} to={thingPath(node.id)} startIcon={<OpenIcon />} sx={{ color: 'text.primary' }}>
              Its page
            </Button>
            {places.length ? (
              <Button component={RouterLink} to={labelsPath(places.map((p) => p.id))} startIcon={<LabelIcon />} data-testid="where-print-labels" sx={{ color: 'text.primary' }}>
                Print labels
              </Button>
            ) : null}
          </Box>
        </Box>
      ) : null}

      {children.length ? (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {places.length ? (
            <Box component="ul" aria-label={node ? `Places in ${node.name}` : 'Places'} sx={{ m: 0, p: 0, ...sheetSx }}>
              {places.map((n) => (
                <PlaceRow key={n.id} node={n} onMenu={onMenu} />
              ))}
            </Box>
          ) : null}
          {things.length ? (
            <Box component="section" aria-labelledby="where-level-things">
              <Typography id="where-level-things" component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary', mb: 0.75 }}>
                Kept here · {things.length}
              </Typography>
              <Box component="ul" sx={{ m: 0, p: 0, ...sheetSx }}>
                {things.map((n) => (
                  <ThingLevelRow key={n.id} item={n} />
                ))}
              </Box>
            </Box>
          ) : null}
        </Box>
      ) : node ? (
        <Box sx={{ ...sheetSx, p: 2 }}>
          <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>Nothing inside yet. Add what's kept here, or open something else and Move it here.</Typography>
        </Box>
      ) : null}

      {node && locationType && isParentKind(kindOf(node)) ? (
        <Button startIcon={<AddInsideIcon />} onClick={() => onAddLocation(node)} sx={{ mt: 1.5, color: 'text.primary' }}>
          Add a location inside
        </Button>
      ) : null}
    </Box>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function WhereView() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const at = params.get('at');
  const scrollRoot = useScrollRoot();
  const { notify } = useToast();
  const { nodes, loading, error, refetch } = useThingTree();
  const { createThing, updateThing } = useThingActions();
  const locationType = useLocationType();
  const [expanded, setExpanded] = useState(() => new Set());
  const [menu, setMenu] = useState(null); // { anchor, node }
  const [dialog, setDialog] = useState(null); // { kind: 'add'|'rename'|'move', node }

  // A new level starts at its top.
  useLayoutEffect(() => {
    if (scrollRoot) scrollRoot.scrollTop = 0;
  }, [at, scrollRoot]);

  const { live, byId, rows, itemsByParent, nowhere, inTrash } = useMemo(() => {
    const liveNodes = nodes.filter((n) => !n.parentInTrash);
    const tree = flattenTree(buildTree(liveNodes, (n) => isParentKind(kindOf(n))));
    const inTree = new Set(tree.map((r) => r.node.id));
    const byParent = new Map();
    const loose = [];
    for (const n of liveNodes) {
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
      live: liveNodes,
      byId: new Map(liveNodes.map((n) => [n.id, n])),
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
  const onMenu = (anchor, n) => setMenu({ anchor, node: n });

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
  const walkHere = (node) => {
    setMenu(null);
    navigate(`/walk?at=${encodeURIComponent(node.id)}`);
  };

  const drilled = isPhone && at && byId.has(at);
  let body;
  if (error && !nodes.length) {
    body = <GeekErrorState title="Where didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 6 }} />;
  } else if (loading) {
    body = <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>Loading…</Typography>;
  } else if (!rows.length) {
    body = (
      <Box sx={{ ...sheetSx, textAlign: 'center', py: 5, px: 2 }}>
        <PlaceIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} aria-hidden="true" />
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Nowhere yet</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
          Start with the big ones — House, Garage, Shop — then add rooms and shelves inside them.
        </Typography>
        {locationType ? (
          <Button variant="contained" startIcon={<AddInsideIcon />} onClick={() => open('add')}>
            Add a location
          </Button>
        ) : null}
      </Box>
    );
  } else if (isPhone) {
    body = (
      <DrillDown
        at={drilled ? at : null}
        live={live}
        byId={byId}
        onMenu={onMenu}
        onAddHere={addHere}
        onMove={(n) => open('move', n)}
        onAddLocation={(n) => open('add', n)}
        onWalk={walkHere}
        locationType={locationType}
      />
    );
  } else {
    body = (
      <Box component="ul" aria-label="Where things are" sx={{ m: 0, p: 0, ...sheetSx, px: 1, py: 0.5 }}>
        {rows.map(({ node, depth }) => (
          <NodeRow
            key={node.id}
            node={node}
            depth={depth}
            items={itemsByParent.get(node.id) ?? []}
            expanded={expanded.has(node.id)}
            onToggle={() => toggle(node.id)}
            onMenu={onMenu}
          />
        ))}
      </Box>
    );
  }

  const menuNode = menu?.node ?? null;
  const menuIsParent = menuNode ? isParentKind(kindOf(menuNode)) : false;
  const topLevel = !drilled;

  return (
    <PageFrame maxWidth={820} sx={{ pt: { xs: 1.5, md: 4 } }}>
      {isPhone ? (
        <>
          <Typography variant="h1" component="h1" sx={visuallyHidden}>
            Where
          </Typography>
          {topLevel ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{WHERE_LEDE}</Typography>
              {rows.length && locationType ? (
                <Button variant="contained" startIcon={<AddInsideIcon />} onClick={() => open('add')} sx={{ flexShrink: 0 }}>
                  Location
                </Button>
              ) : null}
            </Box>
          ) : null}
        </>
      ) : (
        <PageHeader
          title="Where"
          lede={WHERE_LEDE}
          actions={
            rows.length && locationType ? (
              <Button variant="contained" startIcon={<AddInsideIcon />} onClick={() => open('add')}>
                Add a location
              </Button>
            ) : null
          }
        />
      )}
      {body}

      {topLevel ? (
        <>
          <Group testId="where-nowhere" title="Not anywhere yet" lede="Open one and Move it to where it lives." items={nowhere} onMenu={onMenu} />
          <Group testId="where-in-trash" title="Inside something in the Trash" lede="They stay put until it's restored." items={inTrash} onMenu={onMenu} />
        </>
      ) : null}

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {menuIsParent ? (
          <MenuItem onClick={() => addHere(menuNode)} sx={{ minHeight: 44 }}>
            <ListItemIcon>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            Add a thing here
          </MenuItem>
        ) : null}
        {menuIsParent ? (
          <MenuItem onClick={() => walkHere(menuNode)} sx={{ minHeight: 44 }}>
            <ListItemIcon>
              <WalkIcon fontSize="small" />
            </ListItemIcon>
            Walk this room
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
