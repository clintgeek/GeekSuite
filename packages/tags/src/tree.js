/**
 * The tag tree, read off the path strings (`dev/frontend` → `dev` › `frontend`).
 * Moved from NoteGeek's `utils/tagTree.js` (its sidebar), unchanged in shape.
 */

/**
 * @typedef {{ name: string, path: string, count: number|null, children: TagNode[] }} TagNode
 */

/**
 * Build the tree. Every segment becomes a node — an intermediate segment that
 * is not itself a tag (`work` for `work/meetings`) still gets one.
 *
 * `counts` is optional, and either:
 *   - an ARRAY of items `{ id?, _id?, tags }` — a node's count is the number
 *     of DISTINCT items carrying the tag or anything beneath it (`dev` counts
 *     a note tagged `dev/frontend` and `dev/infra` once);
 *   - a plain object or Map `{ tag: n }` — a node's count is the SUM of its
 *     own and its descendants' counts (use when per-tag counts are all there
 *     is, e.g. a `$group` by tag);
 *   - absent / null — every count is `null` and the tree still renders.
 *
 * @param {string[]} tags
 * @param {Array<{id?: string, _id?: string, tags?: string[]}>|Record<string, number>|Map<string, number>|null} [counts]
 * @returns {TagNode[]} top-level nodes, sorted by name
 */
export function tagTree(tags, counts = null) {
  const root = new Map();
  const nodeFor = new Map();

  const ensure = (path) => {
    if (nodeFor.has(path)) return nodeFor.get(path);
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const node = { name, path, _kids: new Map(), _ids: null, _sum: null };
    nodeFor.set(path, node);
    if (parts.length === 1) root.set(name, node);
    else ensure(parts.slice(0, -1).join('/'))._kids.set(name, node);
    return node;
  };

  for (const tag of tags || []) {
    if (typeof tag === 'string' && tag.trim()) ensure(tag);
  }

  const ancestorsOf = (tag) => {
    const parts = tag.split('/');
    const out = [];
    for (let i = 1; i <= parts.length; i += 1) {
      const node = nodeFor.get(parts.slice(0, i).join('/'));
      if (node) out.push(node);
    }
    return out;
  };

  if (Array.isArray(counts)) {
    for (const node of nodeFor.values()) node._ids = new Set();
    counts.forEach((item, index) => {
      const id = item?.id || item?._id || `#${index}`;
      for (const tag of item?.tags || []) {
        if (typeof tag !== 'string') continue;
        for (const node of ancestorsOf(tag)) node._ids.add(String(id));
      }
    });
  } else if (counts && typeof counts === 'object') {
    for (const node of nodeFor.values()) node._sum = 0;
    const entries = counts instanceof Map ? [...counts.entries()] : Object.entries(counts);
    for (const [tag, n] of entries) {
      if (typeof tag !== 'string' || !Number.isFinite(n)) continue;
      for (const node of ancestorsOf(tag)) node._sum += n;
    }
  }

  const finish = (map) =>
    [...map.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => ({
        name: node.name,
        path: node.path,
        count: node._ids ? node._ids.size : node._sum,
        children: finish(node._kids),
      }));

  return finish(root);
}

/**
 * Keep the nodes whose path contains `query` (case-insensitive), plus the
 * ancestors that lead to them, so a deep match is still shown in place. A
 * matching parent keeps all its children.
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
