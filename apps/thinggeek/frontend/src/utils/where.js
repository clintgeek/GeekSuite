/**
 * Where things are: the containment graph (DOCS/THINGGEEK_PLAN.md
 * "Containment"). Every Thing's `parentId` points at another Thing — House ›
 * Garage › Van › Jumper cables — and a type's `kind` decides the role:
 *
 *   location   house, room, shelf: offered as "where it is", never inventory
 *   container  van, safe, toolbox: inventory AND offered as "where it is"
 *   item       inventory; not offered as "where it is" (Move can still put
 *              something inside one)
 *
 * The gateway answers two shapes: a thing's own `path` (root → parent, each
 * crumb `{ id, name, kind, inTrash }`), and `thingTree` — every live thing as
 * a flat node `{ id, name, parentId, parentInTrash, kind, type, childCount,
 * itemCount }`. These helpers make the tree, its reading order and its
 * labels. Pure, so the Where page, every picker and the facet agree.
 */

export const PATH_SEP = ' › ';

export const THING_KINDS = ['location', 'container', 'item'];
/** The kinds the "where is it?" picker offers. */
export const PARENT_KINDS = ['location', 'container'];

export const KIND_LABELS = {
  location: { one: 'Location', many: 'Locations', hint: 'House, room, closet, shelf. Not inventory: never in the insurance report.' },
  container: { one: 'Container', many: 'Containers', hint: 'Van, boat, safe, toolbox. Inventory that holds other things.' },
  item: { one: 'Item', many: 'Items', hint: 'Jumper cables, a firearm, a keyboard.' },
};

export const kindOf = (thing) => thing?.kind || thing?.type?.kind || 'item';
export const isParentKind = (kind) => PARENT_KINDS.includes(kind);
export const isLocation = (thing) => kindOf(thing) === 'location';

const KIND_RANK = { location: 0, container: 1, item: 2 };
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
/** Siblings read locations first, then containers, then items, each by name. */
export const bySiblingOrder = (a, b) => (KIND_RANK[kindOf(a)] ?? 2) - (KIND_RANK[kindOf(b)] ?? 2) || byName(a, b);

// ── A thing's own path ───────────────────────────────────────────────────────

/** Root → parent crumbs, as the gateway sent them. */
export const pathOf = (thing) => (Array.isArray(thing?.path) ? thing.path : []);

/** "House › Garage › Van" — the whole walk. */
export function whereLabel(thing) {
  return pathOf(thing)
    .map((p) => p.name)
    .join(PATH_SEP);
}

/**
 * The short form for cards and rows: the parent and ITS parent ("Garage ›
 * Van") — enough to tell two Shelf 2s apart without the walk from the door.
 */
export function shortWhereLabel(thing) {
  return pathOf(thing)
    .slice(-2)
    .map((p) => p.name)
    .join(PATH_SEP);
}

/** Does this thing get a Contains section? Locations and containers always; an item once something is in it. */
export const showsContents = (thing) => isParentKind(kindOf(thing)) || (thing?.contentsCount ?? 0) > 0;

/** Is something this thing is inside in the Trash? */
export const insideTrash = (thing) => pathOf(thing).some((p) => p.inTrash);

// ── The tree ─────────────────────────────────────────────────────────────────

/**
 * Flat nodes → roots, each `{ ...node, children: [...] }`, siblings in
 * sibling order. `include(node)` keeps a subset (the "where is it?" picker
 * keeps locations and containers); a node whose parent is left out, missing
 * or in the Trash becomes a root.
 */
export function buildTree(nodes = [], include = () => true) {
  const kept = nodes.filter(include);
  const map = new Map(kept.map((n) => [n.id, { ...n, children: [] }]));
  const roots = [];
  for (const node of map.values()) {
    const parent = node.parentId ? map.get(node.parentId) : null;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sortDeep = (list) => {
    list.sort(bySiblingOrder);
    list.forEach((n) => sortDeep(n.children));
    return list;
  };
  return sortDeep(roots);
}

/** The tree in reading order: `[{ node, depth }]`. */
export function flattenTree(roots) {
  const out = [];
  const seen = new Set();
  const walk = (list, depth) => {
    for (const n of list) {
      if (seen.has(n.id)) continue; // a cycle the server should have refused
      seen.add(n.id);
      out.push({ node: n, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

/** Root → node names, by walking parents through `byId`. */
export function nodePathNames(node, byId) {
  const names = [];
  const seen = new Set();
  let cur = node;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    names.unshift(cur.name);
    cur = cur.parentId && byId ? byId.get(cur.parentId) : null;
  }
  return names;
}

/** "Garage › Van" for a tree node — the facet's and the picker's label. */
export function shortNodeLabel(node, byId) {
  return nodePathNames(node, byId).slice(-2).join(PATH_SEP);
}

export function nodeLabel(node, byId) {
  return nodePathNames(node, byId).join(PATH_SEP);
}

/** Ids of the locations and containers in tree order — the Where facet's fixed order. */
export function whereOrder(nodes = []) {
  return flattenTree(buildTree(nodes, (n) => isParentKind(kindOf(n)))).map((row) => row.node.id);
}

/** The id itself plus everything inside it — what a Move picker must refuse. */
export function subtreeIds(nodes = [], id) {
  const kids = new Map();
  for (const n of nodes) {
    if (!n.parentId) continue;
    if (!kids.has(n.parentId)) kids.set(n.parentId, []);
    kids.get(n.parentId).push(n.id);
  }
  const out = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(kids.get(cur) || []));
  }
  return out;
}

/** "12 things inside" / "3 here · 12 in all" for a tree node. */
export function countsText(node) {
  const direct = node.childCount ?? 0;
  const total = node.itemCount ?? 0;
  if (!direct) return 'Empty';
  if (!total) return `${direct} inside`;
  return `${total} thing${total === 1 ? '' : 's'}`;
}
