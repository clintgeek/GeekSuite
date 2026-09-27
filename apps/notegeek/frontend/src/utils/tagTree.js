/**
 * The sidebar's tag tree, with note counts.
 *
 * Tags are paths (`dev/frontend`); every segment becomes a node. A node's
 * count is the number of DISTINCT notes carrying that tag or any tag below
 * it — `dev` counts a note tagged `dev/frontend` and `dev/infra` once, not
 * twice — which is what "how much is under here?" means.
 *
 * Counts are optional: with no `notes` (the count query has not landed, or
 * failed) every count is `null` and the tree still renders.
 *
 * @param {string[]} tags   the tag index (`noteTags`)
 * @param {Array<{ id?: string, _id?: string, tags?: string[] }>|null} notes
 * @returns {Array<TagNode>} top-level nodes, sorted by name
 *
 * @typedef {{ name: string, path: string, count: number|null, children: TagNode[] }} TagNode
 */
export function buildTagTree(tags, notes = null) {
  const root = new Map();
  const nodeFor = new Map();

  const ensure = (path) => {
    if (nodeFor.has(path)) return nodeFor.get(path);
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const node = { name, path, count: null, children: [], _kids: new Map(), _ids: null };
    nodeFor.set(path, node);
    if (parts.length === 1) {
      root.set(name, node);
    } else {
      const parent = ensure(parts.slice(0, -1).join('/'));
      parent._kids.set(name, node);
    }
    return node;
  };

  for (const tag of tags || []) {
    if (typeof tag === 'string' && tag.trim()) ensure(tag);
  }

  if (Array.isArray(notes)) {
    for (const node of nodeFor.values()) node._ids = new Set();
    notes.forEach((note, index) => {
      const id = note?.id || note?._id || `#${index}`;
      for (const tag of note?.tags || []) {
        if (typeof tag !== 'string') continue;
        // Credit the tag and every ancestor of it.
        const parts = tag.split('/');
        for (let i = 1; i <= parts.length; i += 1) {
          const node = nodeFor.get(parts.slice(0, i).join('/'));
          if (node) node._ids.add(id);
        }
      }
    });
  }

  const finish = (map) =>
    [...map.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => ({
        name: node.name,
        path: node.path,
        count: node._ids ? node._ids.size : null,
        children: finish(node._kids),
      }));

  return finish(root);
}

/**
 * Keep the nodes whose path matches `query` (case-insensitive), plus the
 * ancestors that lead to them, so a match deep in the tree is still shown in
 * place. A matching parent keeps all its children.
 */
export function filterTagTree(nodes, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return nodes;
  const walk = (list) =>
    list.flatMap((node) => {
      if (node.path.toLowerCase().includes(q)) return [node];
      const children = walk(node.children);
      return children.length ? [{ ...node, children }] : [];
    });
  return walk(nodes);
}
