/**
 * Relationships as sentences. A relationship is stored once, on the thing
 * that says it ("the lens is an accessory for the camera"); the gateway
 * derives the inverse at read time (`direction: 'in'` on the camera). Each
 * kind reads differently from each end.
 *
 * WHERE a thing is is not a relationship — that is its parent (utils/
 * where.js). Since containment (2026-09-26) the only kind is accessory-of:
 * the lens that belongs to the camera but lives in a drawer.
 */

export const RELATIONSHIP_PHRASES = {
  'accessory-of': { out: 'Accessory for', in: 'Accessories' },
};

/** The editor's words for choosing a kind: "This thing is … [other thing]". */
export const RELATIONSHIP_KIND_LABELS = {
  'accessory-of': 'is an accessory for',
};

export function relationshipPhrase(kind, direction = 'out') {
  const p = RELATIONSHIP_PHRASES[kind];
  if (!p) return kind;
  return direction === 'in' ? p.in : p.out;
}

/**
 * Relationships → `[{ key, phrase, kind, direction, things: [summary] }]`,
 * in kind order then outgoing before incoming.
 */
export function groupRelationships(relationships = [], kindOrder = Object.keys(RELATIONSHIP_PHRASES)) {
  const groups = new Map();
  for (const r of relationships) {
    if (!r?.thing) continue;
    const direction = r.direction === 'in' ? 'in' : 'out';
    const key = `${r.kind}:${direction}`;
    if (!groups.has(key)) groups.set(key, { key, kind: r.kind, direction, phrase: relationshipPhrase(r.kind, direction), things: [] });
    const g = groups.get(key);
    if (!g.things.some((t) => t.id === r.thing.id)) g.things.push(r.thing);
  }
  const rank = (g) => {
    const k = kindOrder.indexOf(g.kind);
    return (k === -1 ? kindOrder.length : k) * 2 + (g.direction === 'in' ? 1 : 0);
  };
  return [...groups.values()].sort((a, b) => rank(a) - rank(b));
}

/** "Accessories: 50mm lens and spare battery" — one line, for screen readers and CSV. */
export function relationshipSentence(group) {
  const names = group.things.map((t) => t.name);
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${group.phrase}: ${list}`;
}
