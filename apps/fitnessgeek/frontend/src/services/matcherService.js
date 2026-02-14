import { fitnessGeekService } from './fitnessGeekService.js';

function tokenize(s) {
  return new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean));
}

function similarity(a, b) {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.max(A.size, B.size);
}

function mapFoodToCandidate(f) {
  return {
    _id: f._id,
    name: f.name,
    brand: f.brand,
    source: f.source || 'food',
    serving: { size: f.serving?.size || 100, unit: f.serving?.unit || 'g' },
    nutrition: f.nutrition || {},
  };
}

export const matcherService = {
  async matchCandidates(parsed, limit = 10) {
    const query = parsed?.name || '';
    if (!query) return [];
    const [foods, meals] = await Promise.all([
      fitnessGeekService.searchFoods(query, limit),
      fitnessGeekService.getMeals(null, query).catch(() => []),
    ]);

    const foodCandidates = (foods || []).map(mapFoodToCandidate);
    const mealCandidates = (meals || []).map((m) => ({
      _id: m._id,
      name: m.name,
      brand: m.brand,
      source: 'meal',
      // Approximate serving and nutrition from first item if present
      serving: { size: 1, unit: 'serving' },
      nutrition: { calories_per_serving: (m.food_items || []).reduce((s, it) => s + ((it.food_item_id?.nutrition?.calories_per_serving || 0) * (it.servings || 1)), 0) },
    }));

    const all = [...foodCandidates, ...mealCandidates];
    const scored = all.map((c) => ({
      ...c,
      score: similarity(parsed.name, c.name) + (parsed.modifiers?.brand && c.brand ? 0.2 * similarity(parsed.modifiers.brand, c.brand) : 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored;
  },
};


