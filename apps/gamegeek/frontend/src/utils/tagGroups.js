/**
 * The tag vocabulary's groups, for presenting the Tags facet
 * (DOCS/TAGS_AND_FILTERS.md §A1).
 *
 * LOCAL MIRROR of `TAG_GROUPS` in packages/schemas/gamegeek/tags.js — same
 * shape (`[{ id, label, tags }]`), same order, copied 2026-09-25. The
 * frontend does not depend on the schemas package (no workspace dep, and that
 * module also carries the provider synonym table the browser has no use for),
 * so the list is copied; the server owns the vocabulary and this file only
 * decides where a tag SITS. A tag the server knows and this file does not
 * still renders — under "Your tags", with the household's own.
 */
export const TAG_GROUPS = [
  {
    id: 'gameplay',
    label: 'Gameplay',
    tags: [
      'Open World', 'Sandbox', 'Roguelike', 'Roguelite', 'Metroidvania', 'Soulslike', 'Survival', 'Crafting',
      'Base Building', 'Deckbuilder', 'Tower Defense', 'Bullet Hell', 'Twin-Stick', 'Stealth',
      'Puzzle-Platformer', 'Physics', 'City Builder', 'Colony Sim', 'Management', '4X', 'Grand Strategy',
      'Tactics', 'Turn-Based', 'Real-Time', 'Loot', 'Looter Shooter', 'Exploration', 'Hunting', 'Fishing',
      'Farming', 'Driving', 'Flight', 'Rhythm', 'Party', 'Trivia', 'Idle', 'Auto Battler', 'Battle Royale',
      'Extraction', 'Hero Shooter', "Beat 'em up", 'Platformer', 'Hidden Object',
    ],
  },
  {
    id: 'story',
    label: 'Story & mood',
    tags: [
      'Story Rich', 'Choices Matter', 'Multiple Endings', 'Narrative', 'Walking Simulator', 'Mystery',
      'Detective', 'Comedy', 'Horror', 'Psychological Horror', 'Survival Horror', 'Cozy', 'Relaxing',
      'Difficult', 'Atmospheric', 'Emotional', 'Dark',
    ],
  },
  {
    id: 'setting',
    label: 'Setting',
    tags: [
      'Fantasy', 'Dark Fantasy', 'Sci-fi', 'Space', 'Cyberpunk', 'Post-apocalyptic', 'Zombies', 'Historical',
      'Medieval', 'Western', 'Military', 'Lovecraftian', 'Anime', 'Mythology', 'Pirates', 'Nature',
      'Superhero',
    ],
  },
  {
    id: 'look',
    label: 'Look & view',
    tags: [
      'Pixel Art', 'Retro', 'Hand-drawn', 'Low-poly', 'Cartoony', 'Realistic', '2D', '3D', 'Isometric',
      'Top-down', 'Side-scroller', 'First-person', 'Third-person', 'VR',
    ],
  },
];

/** Where anything outside the vocabulary goes: the user's tags, Playnite categories. */
export const USER_TAG_GROUP = 'Your tags';

export const TAG_GROUP_ORDER = [...TAG_GROUPS.map((g) => g.label), USER_TAG_GROUP];

const GROUP_OF = new Map(TAG_GROUPS.flatMap((g) => g.tags.map((t) => [t.toLowerCase(), g.label])));

export function tagGroupOf(tag) {
  return GROUP_OF.get(String(tag).toLowerCase()) || USER_TAG_GROUP;
}

/** Options (`{ value, … }`) bucketed by group, in group order; empty groups dropped. */
export function groupTagOptions(options) {
  const buckets = new Map(TAG_GROUP_ORDER.map((g) => [g, []]));
  options.forEach((o) => buckets.get(tagGroupOf(o.value)).push(o));
  return TAG_GROUP_ORDER.map((group) => ({ group, options: buckets.get(group) })).filter((g) => g.options.length);
}
