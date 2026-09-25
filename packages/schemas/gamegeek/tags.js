/**
 * gamegeek's canonical tag vocabulary and the provider-term synonym table
 * (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A1).
 *
 * Provider tags are noisy — RAWG alone has thousands, IGDB keywords include
 * "steam achievements" and "pax east 2016" — so enrichment never stores them
 * raw. Every provider term is normalized (normalizeTagTerm), looked up in
 * TAG_SYNONYMS, and either mapped to one canonical tag or DROPPED. A game
 * gets at most MAX_AUTO_TAGS of them.
 *
 * Extend deliberately: add the canonical tag to its group AND the provider
 * spellings to SYNONYMS below. A tag's own name always maps to itself.
 * An explicit `null` in SYNONYMS documents a considered drop.
 */

const TAG_GROUPS = Object.freeze(
  [
    {
      id: 'gameplay',
      label: 'Gameplay',
      tags: [
        'Open World', 'Sandbox', 'Roguelike', 'Roguelite', 'Metroidvania', 'Soulslike', 'Survival', 'Crafting',
        'Base Building', 'Deckbuilder', 'Tower Defense', 'Bullet Hell', 'Twin-Stick', 'Stealth', 'Puzzle-Platformer',
        'Physics', 'City Builder', 'Colony Sim', 'Management', '4X', 'Grand Strategy', 'Tactics', 'Turn-Based',
        'Real-Time', 'Loot', 'Looter Shooter', 'Exploration', 'Hunting', 'Fishing', 'Farming', 'Driving', 'Flight',
        'Rhythm', 'Party', 'Trivia', 'Idle', 'Auto Battler', 'Battle Royale', 'Extraction', 'Hero Shooter',
        "Beat 'em up", 'Platformer', 'Hidden Object',
      ],
    },
    {
      id: 'story',
      label: 'Story & mood',
      tags: [
        'Story Rich', 'Choices Matter', 'Multiple Endings', 'Narrative', 'Walking Simulator', 'Mystery', 'Detective',
        'Comedy', 'Horror', 'Psychological Horror', 'Survival Horror', 'Cozy', 'Relaxing', 'Difficult', 'Atmospheric',
        'Emotional', 'Dark',
      ],
    },
    {
      id: 'setting',
      label: 'Setting',
      tags: [
        'Fantasy', 'Dark Fantasy', 'Sci-fi', 'Space', 'Cyberpunk', 'Post-apocalyptic', 'Zombies', 'Historical',
        'Medieval', 'Western', 'Military', 'Lovecraftian', 'Anime', 'Mythology', 'Pirates', 'Nature', 'Superhero',
      ],
    },
    {
      id: 'look',
      label: 'Look & view',
      tags: [
        'Pixel Art', 'Retro', 'Hand-drawn', 'Low-poly', 'Cartoony', 'Realistic', '2D', '3D', 'Isometric', 'Top-down',
        'Side-scroller', 'First-person', 'Third-person', 'VR',
      ],
    },
  ].map((g) => Object.freeze({ ...g, tags: Object.freeze(g.tags) }))
);

const ALL_TAGS = Object.freeze(TAG_GROUPS.flatMap((g) => g.tags));

const MAX_AUTO_TAGS = 12;

/**
 * The lookup key: NFKC, lowercase, `&` → "and", apostrophes removed (so
 * "beat 'em up" and "beat-em-up" meet), every other run of non-letters and
 * non-digits → one space, trimmed.
 */
function normalizeTagTerm(term) {
  if (typeof term !== 'string') return '';
  return term
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Provider spelling → canonical tag (or null = drop on purpose). Keys are
 * written as the providers spell them and normalized when the table is built.
 * Covers IGDB themes, IGDB player perspectives, common IGDB keywords and RAWG
 * tag slugs/names.
 */
const SYNONYMS = {
  // ── IGDB themes ──
  'Science fiction': 'Sci-fi',
  Warfare: 'Military',
  '4X (explore, expand, exploit, and exterminate)': '4X',
  Business: 'Management',
  Action: null,
  Thriller: null,
  Drama: null,
  Kids: null,
  Erotic: null,
  'Non-fiction': null,
  Educational: null,
  Romance: null,
  // ── IGDB player perspectives ──
  'First person': 'First-person',
  'Third person': 'Third-person',
  'Bird view / Isometric': 'Isometric',
  'Side view': 'Side-scroller',
  'Virtual Reality': 'VR',
  Text: null,
  Auditory: null,
  // ── IGDB keywords / RAWG tags ──
  'rogue-like': 'Roguelike',
  'rogue-lite': 'Roguelite',
  'souls-like': 'Soulslike',
  'souls like': 'Soulslike',
  'pixel-graphics': 'Pixel Art',
  'pixel graphics': 'Pixel Art',
  pixelart: 'Pixel Art',
  'retro graphics': 'Retro',
  'story-rich': 'Story Rich',
  'story driven': 'Story Rich',
  'choices-matter': 'Choices Matter',
  'choice matters': 'Choices Matter',
  'multiple-endings': 'Multiple Endings',
  'gameplay feature: multiple endings': 'Multiple Endings',
  'great-soundtrack': null,
  'great soundtrack': null,
  cosy: 'Cozy',
  wholesome: 'Cozy',
  'base-building': 'Base Building',
  deckbuilding: 'Deckbuilder',
  'deck-building': 'Deckbuilder',
  'deck building': 'Deckbuilder',
  'tower-defense': 'Tower Defense',
  'bullet-hell': 'Bullet Hell',
  'twin-stick-shooter': 'Twin-Stick',
  'twin stick shooter': 'Twin-Stick',
  'twin stick': 'Twin-Stick',
  'city-builder': 'City Builder',
  'city building': 'City Builder',
  'colony-sim': 'Colony Sim',
  'colony simulation': 'Colony Sim',
  'turn-based-combat': 'Turn-Based',
  'turn-based tactics': 'Turn-Based',
  'real-time': 'Real-Time',
  'real-time with pause': 'Real-Time',
  looter: 'Loot',
  'looter-shooter': 'Looter Shooter',
  'open-world': 'Open World',
  'survival-horror': 'Survival Horror',
  'psychological-horror': 'Psychological Horror',
  zombie: 'Zombies',
  postapocalyptic: 'Post-apocalyptic',
  'post apocalyptic': 'Post-apocalyptic',
  'space simulation': 'Space',
  scifi: 'Sci-fi',
  'science-fiction': 'Sci-fi',
  'dark-fantasy': 'Dark Fantasy',
  'wild west': 'Western',
  'eldritch horror': 'Lovecraftian',
  cthulhu: 'Lovecraftian',
  pirate: 'Pirates',
  'hand drawn': 'Hand-drawn',
  'low poly': 'Low-poly',
  cartoon: 'Cartoony',
  'top down': 'Top-down',
  'side scroller': 'Side-scroller',
  sidescroller: 'Side-scroller',
  'first person': 'First-person',
  'third person': 'Third-person',
  'virtual reality': 'VR',
  'party game': 'Party',
  clicker: 'Idle',
  incremental: 'Idle',
  'auto-battler': 'Auto Battler',
  autobattler: 'Auto Battler',
  'battle-royale': 'Battle Royale',
  'extraction-shooter': 'Extraction',
  'extraction shooter': 'Extraction',
  'hero-shooter': 'Hero Shooter',
  'beat-em-up': "Beat 'em up",
  'beat em up': "Beat 'em up",
  '2d platformer': 'Platformer',
  '3d platformer': 'Platformer',
  'hidden-object': 'Hidden Object',
  'walking-simulator': 'Walking Simulator',
  investigation: 'Detective',
  funny: 'Comedy',
  'dark humor': 'Comedy',
  'interactive fiction': 'Narrative',
  humor: 'Comedy',
  'farming-sim': 'Farming',
  'farming sim': 'Farming',
  flying: 'Flight',
  'flight simulator': 'Flight',
  tactical: 'Tactics',
  'grand-strategy': 'Grand Strategy',
  military: 'Military',
  war: 'Military',
  history: 'Historical',
  quiz: 'Trivia',
  // Considered and dropped: modes live elsewhere, store features are not tags.
  singleplayer: null,
  'single-player only': null,
  multiplayer: null,
  'steam achievements': null,
  achievements: null,
  'steam cloud': null,
  'full controller support': null,
};

function buildSynonymTable() {
  const table = {};
  for (const tag of ALL_TAGS) table[normalizeTagTerm(tag)] = tag;
  for (const [term, canonical] of Object.entries(SYNONYMS)) {
    if (canonical !== null && !ALL_TAGS.includes(canonical)) {
      throw new Error(`gamegeek tags: synonym "${term}" maps to unknown tag "${canonical}"`);
    }
    table[normalizeTagTerm(term)] = canonical;
  }
  return Object.freeze(table);
}

/** normalized provider term → canonical tag, or null (drop). Missing = drop too. */
const TAG_SYNONYMS = buildSynonymTable();

const GROUP_INDEX = Object.freeze(
  Object.fromEntries(TAG_GROUPS.flatMap((g, gi) => g.tags.map((t) => [t, gi])))
);

/** The canonical tag for one provider term, or null. */
function canonicalTag(term) {
  const key = normalizeTagTerm(term);
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(TAG_SYNONYMS, key) ? TAG_SYNONYMS[key] : null;
}

/**
 * Provider terms → canonical tags: mapped, deduped, ordered by vocabulary
 * group (Gameplay, Story & mood, Setting, Look & view) and then by first
 * appearance, capped at MAX_AUTO_TAGS. Unmapped terms are dropped.
 * @param {string[]} terms
 * @returns {string[]}
 */
function mapProviderTags(terms, { max = MAX_AUTO_TAGS } = {}) {
  const seen = new Map(); // tag → first index
  let i = 0;
  for (const term of Array.isArray(terms) ? terms : []) {
    const tag = canonicalTag(term);
    if (tag && !seen.has(tag)) seen.set(tag, i);
    i += 1;
  }
  return [...seen.entries()]
    .sort(([a, ai], [b, bi]) => GROUP_INDEX[a] - GROUP_INDEX[b] || ai - bi)
    .slice(0, max)
    .map(([tag]) => tag);
}

module.exports = {
  TAG_GROUPS,
  ALL_TAGS,
  TAG_SYNONYMS,
  MAX_AUTO_TAGS,
  normalizeTagTerm,
  canonicalTag,
  mapProviderTags,
};
