/**
 * Relationships as sentences. A relationship is stored once, on the thing
 * that says it ("Wendy is equipped with the Striker 4"); the gateway derives
 * the inverse at read time (`direction: 'in'` on the fish finder). Each kind
 * reads differently from each end.
 */

export const RELATIONSHIP_PHRASES = {
  'equipped-with': { out: 'Equipped with', in: 'Equipped on' },
  'part-of': { out: 'Part of', in: 'Made up of' },
  'accessory-of': { out: 'Accessory for', in: 'Accessories' },
  'stored-with': { out: 'Stored with', in: 'Stored with' },
};

/** The editor's words for choosing a kind: "This thing is … [other thing]". */
export const RELATIONSHIP_KIND_LABELS = {
  'equipped-with': 'is equipped with',
  'part-of': 'is part of',
  'accessory-of': 'is an accessory for',
  'stored-with': 'is stored with',
};

export function relationshipPhrase(kind, direction = 'out') {
  const p = RELATIONSHIP_PHRASES[kind];
  if (!p) return kind;
  return direction === 'in' ? p.in : p.out;
}

/**
 * Relationships → `[{ key, phrase, kind, direction, things: [summary] }]`,
 * in kind order then outgoing before incoming. "stored-with" reads the same
 * both ways, so its two directions share one sentence.
 */
export function groupRelationships(relationships = [], kindOrder = Object.keys(RELATIONSHIP_PHRASES)) {
  const groups = new Map();
  for (const r of relationships) {
    if (!r?.thing) continue;
    const direction = r.kind === 'stored-with' ? 'out' : r.direction === 'in' ? 'in' : 'out';
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

/** "Equipped with: Garmin Striker 4 and Minn Kota trolling motor" — one line, for screen readers and CSV. */
export function relationshipSentence(group) {
  const names = group.things.map((t) => t.name);
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${group.phrase}: ${list}`;
}
