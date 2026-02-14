// FoodServingMap: approximate grams per piece for common items
// Extendable with user/brand overrides later.

const DEFAULT_PIECE_MASS_G = {
  egg: 50,
  'slice bread': 28,
  tortilla: 30,
  taco: 100,
  wing: 30,
  shrimp: 12,
};

function gramsPerPieceFor(name) {
  const key = String(name || '').toLowerCase();
  const found = Object.entries(DEFAULT_PIECE_MASS_G).find(([k]) => key.includes(k));
  return found ? found[1] : null;
}

module.exports = { gramsPerPieceFor };


