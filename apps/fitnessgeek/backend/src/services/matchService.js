// MatchService: pluggable matcher that scores candidates from sources
const stringSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1;
  // simple token overlap score
  const xt = new Set(x.split(/[^a-z0-9]+/g).filter(Boolean));
  const yt = new Set(y.split(/[^a-z0-9]+/g).filter(Boolean));
  const inter = [...xt].filter((t) => yt.has(t)).length;
  const denom = Math.max(xt.size, yt.size) || 1;
  return inter / denom;
};

async function matchCandidates(parsed, adapters = []) {
  const { name, modifiers = {}, grams } = parsed;
  const all = [];
  for (const adapter of adapters) {
    try {
      const results = await adapter.search(parsed);
      if (Array.isArray(results)) all.push(...results);
    } catch {}
  }
  // score
  const scored = all.map((c) => {
    const base = stringSimilarity(name, c.name);
    const brandBoost = modifiers.brand && c.brand && stringSimilarity(modifiers.brand, c.brand) * 0.2;
    const unitBoost = c.servingGrams ? 0.1 : 0;
    const score = base + (brandBoost || 0) + unitBoost;
    return { ...c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

module.exports = { matchCandidates };


