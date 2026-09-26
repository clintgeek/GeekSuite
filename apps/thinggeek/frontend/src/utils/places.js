/**
 * Places are a tree (House › Garage › Shelf 2). The gateway returns a flat
 * list, each with its root-to-self `path`; these helpers make the tree, its
 * reading order and its labels. Pure, so the tree manager and every picker
 * agree.
 */

export const PATH_SEP = ' › ';

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/** Flat places → roots, each `{ ...place, children: [...] }`, children by name. An orphan is a root. */
export function buildPlaceTree(places = []) {
  const nodes = new Map(places.map((p) => [p.id, { ...p, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sortDeep = (list) => {
    list.sort(byName);
    list.forEach((n) => sortDeep(n.children));
    return list;
  };
  return sortDeep(roots);
}

/** The tree in reading order: `[{ place, depth }]`. */
export function flattenPlaceTree(tree) {
  const out = [];
  const seen = new Set();
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      if (seen.has(n.id)) continue; // a cycle the server should have refused
      seen.add(n.id);
      out.push({ place: n, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}

/** Ids in tree order — the place facet's fixed order. */
export function placeOrder(places = []) {
  return flattenPlaceTree(buildPlaceTree(places)).map((row) => row.place.id);
}

/** Root → place names, from the place's own `path` or by walking parents. */
export function placePathNames(place, byId) {
  if (!place) return [];
  if (Array.isArray(place.path) && place.path.length) return place.path.map((p) => p.name);
  const names = [];
  const seen = new Set();
  let cur = place;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    names.unshift(cur.name);
    cur = cur.parentId && byId ? byId.get(cur.parentId) : null;
  }
  return names;
}

/** "Garage › Shelf 2". */
export function placeLabel(place, byId) {
  return placePathNames(place, byId).join(PATH_SEP);
}

/**
 * The short form for cards and facets: the place and its parent
 * ("Garage › Shelf 2") — enough to tell two Shelf 2s apart without the
 * whole walk from the front door.
 */
export function shortPlaceLabel(place, byId) {
  return placePathNames(place, byId).slice(-2).join(PATH_SEP);
}

/** The id itself plus every descendant — what a "move under…" picker must refuse. */
export function subtreeIds(places = [], id) {
  const kids = new Map();
  for (const p of places) {
    if (!p.parentId) continue;
    if (!kids.has(p.parentId)) kids.set(p.parentId, []);
    kids.get(p.parentId).push(p.id);
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

/** What deleting a place does, in words, for its confirmation. */
export function deletePlaceSummary(place, places = []) {
  const children = places.filter((p) => p.parentId === place.id);
  const parent = place.parentId ? places.find((p) => p.id === place.parentId) : null;
  const parts = [];
  if (children.length) {
    parts.push(
      `${children.length === 1 ? `${children[0].name} moves` : `Its ${children.length} places move`} up to ${parent ? parent.name : 'the top level'}.`
    );
  }
  const direct = place.directCount ?? 0;
  if (direct) parts.push(`${direct === 1 ? 'The 1 thing kept directly here becomes' : `The ${direct} things kept directly here become`} unplaced.`);
  if (!parts.length) parts.push('Nothing is kept here, so nothing else changes.');
  return parts.join(' ');
}
