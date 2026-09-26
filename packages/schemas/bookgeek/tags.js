/**
 * bookgeek's curated tag vocabulary and the raw-tag synonym table
 * (apps/bookgeek/DOCS/TAGS.md). GameGeek's pattern
 * (packages/schemas/gamegeek/tags.js), with one difference that matters:
 * nothing unrecognised is thrown away. GameGeek drops any provider term it
 * cannot map; BookGeek's raw tags came in through Calibre and some of them
 * are Chef's own, so a raw tag that is neither mapped nor on the drop list
 * lands in UNSORTED and stays filterable.
 *
 * Every raw tag is classified exactly one way:
 *   mapped    → one or more canonical tags (Book.libraryTags)
 *   dropped   → on the drop list: noise that is clearly nobody's own tag
 *               (Fiction, General, AUTO, Audiobook, dates, codes, non-English
 *               catalogue terms)
 *   unsorted  → kept as-is (Book.unsortedTags), listed in DOCS/TAGS_REVIEW.md
 *
 * `Book.tags` itself is never rewritten: libraryTags and unsortedTags are
 * derived from it (deriveTagFields) on every write and by the api's boot
 * migration.
 *
 * Extend deliberately: add the canonical tag to its group AND its spellings
 * to SYNONYMS. A canonical tag's own name maps to itself unless SYNONYMS
 * says otherwise (Epic Fantasy also means Fantasy). A `null` in SYNONYMS is
 * a considered drop. Chef's answers in TAGS_REVIEW.md become entries here.
 *
 * Browser note: the web app mirrors TAG_GROUPS only
 * (apps/bookgeek/web/src/utils/tagGroups.js, parity-tested); every mapping
 * decision is made on the server.
 */

const TAG_GROUPS = Object.freeze(
  [
    {
      id: 'genre',
      label: 'Genre',
      tags: [
        'Fantasy', 'Sci-fi', 'Mystery', 'Thriller', 'Horror', 'Romance', 'Literary', 'Historical Fiction',
        'Classics', 'Short Stories', 'Poetry', 'Graphic Novel', 'Western', 'Adventure', 'Humor', 'Contemporary',
      ],
    },
    {
      id: 'nonfiction',
      label: 'Nonfiction',
      tags: [
        'Memoir', 'Biography', 'History', 'True Crime', 'Science', 'Popular Science', 'Religion', 'Philosophy',
        'Politics', 'Business', 'Self-help', 'Travel', 'Food', 'Essays', 'Psychology', 'Health', 'Technology',
      ],
    },
    {
      id: 'audience',
      label: 'Audience',
      tags: ['Young Adult', 'Middle Grade', "Children's"],
    },
    {
      id: 'flavour',
      label: 'Flavour',
      tags: [
        'Space Opera', 'Dystopia', 'Post-apocalyptic', 'Urban Fantasy', 'Epic Fantasy', 'Cyberpunk', 'Time Travel',
        'Magic', 'Supernatural', 'Cults', 'Crime', 'Suspense', 'Coming of Age', 'War', 'Dark', 'Cozy', 'Aliens',
        'Mythology', 'Alternate History', 'Zombies', 'Espionage', 'Survival', 'Legal', 'LGBTQ+',
      ],
    },
  ].map((g) => Object.freeze({ ...g, tags: Object.freeze(g.tags) }))
);

const ALL_TAGS = Object.freeze(TAG_GROUPS.flatMap((g) => g.tags));

/** At most this many canonical tags per book (TAGS.md §2). */
const MAX_LIBRARY_TAGS = 12;

/** The facet's first group (Book.myTags) and its last, collapsed one (Book.unsortedTags). */
const MY_TAGS_GROUP = 'My tags';
const UNSORTED_GROUP = 'Unsorted';

/**
 * The lookup key: NFKC, lowercase, `&` → "and", apostrophes removed, every
 * other run of non-letters and non-digits → one space, trimmed. GameGeek's
 * rule exactly, so `sf_horror`, `Sci-Fi` and `Children's` meet `sf horror`,
 * `sci fi` and `childrens`.
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
 * Raw spelling → canonical tag, list of canonical tags, or null (a
 * considered drop). Keys are written the way they appear in the library and
 * normalized when the table is built. Built from the 752 distinct tags on
 * production, 2026-09-26.
 */
const SYNONYMS = {
  // ── Genre ──
  'Fantasy fiction': 'Fantasy',
  'American Fantasy fiction': 'Fantasy',
  'Fantastic fiction': 'Fantasy',
  'Fantasy & Magic': ['Fantasy', 'Magic'],
  'Comic Fantasy': ['Fantasy', 'Humor'],
  'Dark Fantasy': ['Fantasy', 'Dark'],
  'High Fantasy': ['Fantasy', 'Epic Fantasy'],
  Epic: ['Fantasy', 'Epic Fantasy'],
  Dragons: 'Fantasy',
  'Dragons & Mythical Creatures': ['Fantasy', 'Mythology'],
  // FB2 genre codes (Calibre carries them over): sf_fantasy is FB2's fantasy.
  sf_fantasy: 'Fantasy',
  sf_horror: ['Sci-fi', 'Horror'],
  sf_humor: ['Sci-fi', 'Humor'],
  sf_social: 'Sci-fi',
  'Science Fiction': 'Sci-fi',
  'Science Fiction Fantasy': ['Sci-fi', 'Fantasy'],
  'English Science Fiction And Fantasy': ['Sci-fi', 'Fantasy'],
  'American science fiction': 'Sci-fi',
  'Hard Science Fiction': 'Sci-fi',
  'Military Science Fiction': ['Sci-fi', 'War'],
  scifi: 'Sci-fi',
  sf: 'Sci-fi',
  Space: 'Sci-fi',
  'Space Exploration': 'Sci-fi',
  'Interplanetary voyages': 'Sci-fi',
  'Habitable planets': 'Sci-fi',
  Planets: 'Sci-fi',
  Robots: 'Sci-fi',
  'Mystery & Detective': 'Mystery',
  'Mystery Thriller': ['Mystery', 'Thriller'],
  'Murder Mystery': 'Mystery',
  Detective: 'Mystery',
  'Women Sleuths': 'Mystery',
  'Police Procedural': ['Mystery', 'Crime'],
  'Crime & Mystery': ['Crime', 'Mystery'],
  Thrillers: 'Thriller',
  'Legal Thriller': ['Thriller', 'Legal'],
  'Horror Thriller': ['Horror', 'Thriller'],
  'Spy Thriller': ['Thriller', 'Espionage'],
  'Covert Operations': 'Espionage',
  'American Spy stories': 'Espionage',
  'Contemporary Romance': ['Contemporary', 'Romance'],
  'Romantic Comedy': ['Romance', 'Humor'],
  'Literary Fiction': 'Literary',
  Historical: 'Historical Fiction',
  'Classic Literature': 'Classics',
  'Modern Classics': 'Classics',
  Anthologies: 'Short Stories',
  Collections: 'Short Stories',
  'Collections & Anthologies': 'Short Stories',
  'Literary Collections': 'Short Stories',
  'Graphic Novels': 'Graphic Novel',
  'Comics & Graphic Novels': 'Graphic Novel',
  'Graphic Novels Comics': 'Graphic Novel',
  Comics: 'Graphic Novel',
  Westerns: 'Western',
  'Action & Adventure': 'Adventure',
  Action: 'Adventure',
  'Action and adventure fiction': 'Adventure',
  'Adventure fiction': 'Adventure',
  'Sea Stories': 'Adventure',
  Comedy: 'Humor',
  Humorous: 'Humor',
  'Humorous Stories': 'Humor',
  Satire: 'Humor',
  'Black Comedy': ['Humor', 'Dark'],
  'Contemporary Women': 'Contemporary',
  'Realistic Fiction': 'Contemporary',
  // ── Nonfiction ──
  Memoirs: 'Memoir',
  'Personal Memoirs': 'Memoir',
  Autobiography: 'Memoir',
  'Biography Memoir': ['Biography', 'Memoir'],
  'Biography & Autobiography': ['Biography', 'Memoir'],
  'Biography: general': 'Biography',
  'Christian biography': ['Biography', 'Religion'],
  'Ancient History': 'History',
  'Church history': ['History', 'Religion'],
  'World War II': ['History', 'War'],
  Holocaust: 'History',
  Physics: 'Science',
  'Genetic Engineering': 'Science',
  Religions: 'Religion',
  Religious: 'Religion',
  Christian: 'Religion',
  Christianity: 'Religion',
  'Christian Fiction': 'Religion',
  'Christian Living': 'Religion',
  'Christian communities': 'Religion',
  'Christian sects': 'Religion',
  Theology: 'Religion',
  Spirituality: 'Religion',
  Spiritual: 'Religion',
  'Spiritual Growth': 'Religion',
  'Spiritual Warfare': 'Religion',
  Faith: 'Religion',
  Prayer: 'Religion',
  Prayerbooks: 'Religion',
  'Biblical Studies': 'Religion',
  'Religion - Inspirational/Spirituality': 'Religion',
  'Religious aspects': 'Religion',
  Metaphysics: 'Philosophy',
  Political: 'Politics',
  'Political Science': 'Politics',
  'Politics and government': 'Politics',
  'American Government': 'Politics',
  'Executive Branch': 'Politics',
  'Presidents & Heads of State': 'Politics',
  'Public Affairs & Administration': 'Politics',
  'Government & Business': ['Politics', 'Business'],
  'Civil rights': 'Politics',
  'Political fiction': 'Politics',
  'American Political fiction': 'Politics',
  Buisness: 'Business',
  'Business & Economics': 'Business',
  Economics: 'Business',
  Entrepreneurship: 'Business',
  Management: 'Business',
  Leadership: 'Business',
  Retail: 'Business',
  'Electronic commerce': ['Business', 'Technology'],
  'Electronic funds transfers': 'Business',
  'International economic integration': 'Business',
  'Self Help': 'Self-help',
  'Personal Growth': 'Self-help',
  Success: 'Self-help',
  'Life change events': 'Self-help',
  'Essays & Travelogues': ['Essays', 'Travel'],
  Cooking: 'Food',
  Cookbooks: 'Food',
  Cookery: 'Food',
  Culinary: 'Food',
  'Food And Drink': 'Food',
  'Courses & Dishes': 'Food',
  Restaurants: 'Food',
  'Mental Health': 'Health',
  Medical: 'Health',
  'Medical - Physicians': 'Health',
  Diseases: 'Health',
  Vaccination: 'Health',
  Vaccines: 'Health',
  Pediatrics: 'Health',
  Patients: 'Health',
  'Communication in medicine': 'Health',
  Computers: 'Technology',
  'Computer science': 'Technology',
  Programming: 'Technology',
  'Programming Languages': 'Technology',
  Software: 'Technology',
  'High Tech': 'Technology',
  'Computer programmers': 'Technology',
  'Human-computer interaction': 'Technology',
  'Application program interfaces': 'Technology',
  'Internet programming': 'Technology',
  'Web programming': 'Technology',
  'Web site development': 'Technology',
  'Web sites': 'Technology',
  'Web sites - Design': 'Technology',
  'Site design': 'Technology',
  'Page design': 'Technology',
  'Cascading style sheets': 'Technology',
  'Relational databases': 'Technology',
  'Query languages': 'Technology',
  HTML: 'Technology',
  JavaScript: 'Technology',
  PHP: 'Technology',
  MySQL: 'Technology',
  SQL: 'Technology',
  Java: 'Technology',
  // ── Audience ──
  Teen: 'Young Adult',
  'Young Adult Fiction': 'Young Adult',
  'Young adult works': 'Young Adult',
  'Young Adult Fantasy': ['Young Adult', 'Fantasy'],
  Children: "Children's",
  "Children's fiction": "Children's",
  Juvenile: "Children's",
  'Juvenile Fiction': "Children's",
  'Juvenile literature': "Children's",
  'Juvenile works': "Children's",
  'Chapter Books': "Children's",
  'Picture Books': "Children's",
  // ── Flavour ──
  // A sub-genre also counts under its genre, so picking Fantasy finds the
  // urban and epic ones too.
  'Space Opera': ['Space Opera', 'Sci-fi'],
  'Urban Fantasy': ['Urban Fantasy', 'Fantasy'],
  'Epic Fantasy': ['Epic Fantasy', 'Fantasy'],
  Cyberpunk: ['Cyberpunk', 'Sci-fi'],
  Dystopian: 'Dystopia',
  Dystopias: 'Dystopia',
  'Dystopian fiction': 'Dystopia',
  Totalitarianism: 'Dystopia',
  Totalitarianisms: 'Dystopia',
  'Post-apocalypse': 'Post-apocalyptic',
  Apocalyptic: 'Post-apocalyptic',
  'Apocalyptic fiction': 'Post-apocalyptic',
  'End of the world': 'Post-apocalyptic',
  Doomsday: 'Post-apocalyptic',
  'Wizards & Witches': 'Magic',
  Witches: 'Magic',
  'Mystical powers': 'Magic',
  Paranormal: 'Supernatural',
  Ghosts: 'Supernatural',
  Vampires: 'Supernatural',
  'Occult & Supernatural': 'Supernatural',
  Occult: 'Supernatural',
  'the Occult': 'Supernatural',
  Demonism: 'Supernatural',
  'Religious Cults': ['Cults', 'Religion'],
  'Cult members': 'Cults',
  'Ex-cultists': 'Cults',
  Noir: 'Crime',
  Thieves: 'Crime',
  'Law & Crime': ['Legal', 'Crime'],
  'Suspense fiction': 'Suspense',
  Military: 'War',
  'Military Fiction': 'War',
  'War & military': 'War',
  'War stories': 'War',
  'World War': 'War',
  'Prisoners of war': 'War',
  'Imaginary wars and battles': 'War',
  'Alien Contact': ['Aliens', 'Sci-fi'],
  'Human-alien encounters': ['Aliens', 'Sci-fi'],
  'Life on other planets': ['Aliens', 'Sci-fi'],
  Aliens: ['Aliens', 'Sci-fi'],
  'Greek Mythology': 'Mythology',
  'Alternative History': 'Alternate History',
  'Alternative histories': 'Alternate History',
  'Survival Stories': 'Survival',
  'Survival Fiction': 'Survival',
  'Survival skills': 'Survival',
  Law: 'Legal',
  'Constitutional law': 'Legal',
  LGBT: 'LGBTQ+',
  Queer: 'LGBTQ+',
  Lesbian: 'LGBTQ+',

  // ── Dropped: too broad to filter on, import markers, catalogue noise ──
  Fiction: null,
  General: null,
  Novels: null,
  Novel: null,
  Adult: null,
  'Adult Fiction': null,
  Literature: null,
  AUTO: null,
  // Chef 2026-09-26: "Just remove it" — every book here is an ebook.
  Audiobook: null,
  Audiobooks: null,
  None: null,
  'Fictional Work': null,
  'Fictional Works': null,
  'Genres & Styles': null,
  'Subjects & Themes': null,
  'etc.': null,
  // "Westboro Baptist Church (Topeka, Kan.)" split on its comma by Calibre.
  'Kan.)': null,
  Kan: null,
  'Large type books': null,
  'Accelerated Reader': null,
  'Open Library staff picks': null,
  'New York Times reviewed': null,
  'New York Times bestseller': null,
  'Spanish language materials': null,
  'Chinese language materials': null,
  'Translations into Chinese': null,
  // Non-English catalogue terms (TAGS.md §2: dropped, not mapped).
  Novela: null,
  'Novela juvenil': null,
  Adulto: null,
  'Ficción': null,
  'Fantasía': null,
  Magia: null,
  Roman: null,
  Romans: null,
  nouvelles: null,
  'Romans, nouvelles': null,
  'Roman américain': null,
  "Roman d'aventures": null,
  'Roman pour jeunes adultes': null,
  'Romans, nouvelles, etc. pour la jeunesse': null,
  'Jeux télévisés Romans, nouvelles, etc. pour la jeunesse': null,
  Supervivencia: null,
  Competencias: null,
  Concursos: null,
  Programas: null,
  'Programas de televisión': null,
  'Televisión': null,
  Terrorismo: null,
  'Relaciones humanas': null,
  'Relations humaines': null,
  'Bücherverbrennung': null,
  'Fantastische Erzahlung': null,
  'Fantastische Literatur': null,
  'Amerikanisches Englisch': null,
  'Literatură americană': null,
  'Autodafé de livres': null,
  Nazisme: null,
  Juifs: null,
  Totalitarisme: null,
  "Terrorisme d'État": null,
  'Voyages dans le temps': null,
  'Habiletés de survie': null,
  'Émissions télévisées': null,
  'Émissions televiseés': null,
  Programmeurs: null,
  'Développement': null,
  'Concours et compétitions': null,
  Webbdesign: null,
  Webbsidor: null,
  Internetprogrammering: null,
  'CSS (märkspråk)': null,
  "Langages d'interrogation": null,
  'JavaScript (Langage de programmation)': null,
  'PHP (Langage de programmation)': null,
  'Guerra Mundial 11': null,
  'Zhang pian Fiction': null,
  'Intégration économique internationale': null,
  'Sites Web': null,
};

/**
 * Drops by shape, tested against the normalized key (or the raw text where
 * the punctuation is the tell). Each is catalogue or import machinery, never
 * a person's own tag.
 */
const DROP_PATTERNS = Object.freeze([
  // Dates and date ranges: "1922-2007", "1939-1945".
  { test: (raw, key) => /^\d{3,4}( \d{2,4})?$/.test(key) },
  // Centuries: "20Th Century".
  { test: (raw, key) => /^\d{1,2}(st|nd|rd|th) century$/.test(key) },
  // Reading-level metadata: "Reading Level-Grade 10".
  { test: (raw, key) => /^reading level grade \d+$/.test(key) },
  // Machine tags: "award:hugo_award=1963", "nyt:series_books=2010-08-21", "Serie:The_Hunger_Games".
  { test: (raw) => /^[a-z][a-z_]*:\S/i.test(raw.trim()) },
  // Subject codes and call numbers: "Com060160", "Cs.cmp_sc.app_sw", "Qa76.73.p224".
  { test: (raw) => /^[a-z]{2,4}\d{5,}$/i.test(raw.trim()) },
  { test: (raw) => /^cs\.[\w.]+$/i.test(raw.trim()) },
  { test: (raw) => /^[a-z]{1,3}\d+(\.\d+)*\.[a-z]\d+$/i.test(raw.trim()) },
  // FAST headings with an OCLC id: "World War (1939-1945) fast (OCoLC)fst01180924".
  { test: (raw) => /\(ocolc\)|\bfst\d{5,}/i.test(raw) },
]);

/**
 * Catalogue qualifiers that name a thing inside a book rather than what the
 * book is: "Wiggin, Ender (Fictitious character)", "Dune (Imaginary place)".
 * A heading part carrying one is dropped. Any other trailing qualifier
 * ("(Organization)", "(Computer language)") is stripped before lookup.
 */
const ENTITY_QUALIFIERS = Object.freeze(['fictitious character', 'imaginary place']);

function buildSynonymTable() {
  const table = {};
  for (const tag of ALL_TAGS) table[normalizeTagTerm(tag)] = [tag];
  for (const [term, canonical] of Object.entries(SYNONYMS)) {
    const list = canonical === null ? null : Array.isArray(canonical) ? canonical : [canonical];
    for (const tag of list ?? []) {
      if (!ALL_TAGS.includes(tag)) throw new Error(`bookgeek tags: synonym "${term}" maps to unknown tag "${tag}"`);
    }
    table[normalizeTagTerm(term)] = list ? Object.freeze([...list]) : null;
  }
  return Object.freeze(table);
}

/** normalized raw tag → canonical tags (array) or null (drop). Missing = not known. */
const TAG_SYNONYMS = buildSynonymTable();

const GROUP_INDEX = Object.freeze(
  Object.fromEntries(TAG_GROUPS.flatMap((g, gi) => g.tags.map((t) => [t, gi])))
);

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const MAPPED = (tags) => ({ kind: 'mapped', tags });
const DROPPED = Object.freeze({ kind: 'dropped' });
const UNSORTED = Object.freeze({ kind: 'unsorted' });

/** One term, no heading parsing: the table, then the drop shapes. */
function lookup(raw) {
  const key = normalizeTagTerm(raw);
  if (!key) return DROPPED;
  if (has(TAG_SYNONYMS, key)) return TAG_SYNONYMS[key] ? MAPPED(TAG_SYNONYMS[key]) : DROPPED;
  if (DROP_PATTERNS.some((p) => p.test(raw, key))) return DROPPED;
  return UNSORTED;
}

/** "X (Qualifier)" → { base: "X", qualifier: "qualifier" }; no qualifier → null. */
function splitQualifier(part) {
  const m = /^(.*?)\s*\(([^()]*)\)\s*\.?$/.exec(part);
  if (!m) return null;
  return { base: m[1].trim(), qualifier: m[2].trim().toLowerCase() };
}

/**
 * A heading part: its qualifier first (an entity is dropped, anything else
 * is stripped), then the "... Fiction" / "... Juvenile fiction" form-subdivision
 * suffix that Calibre flattens onto the end ("Survival skills Fiction").
 */
function lookupPart(part) {
  const text = part.replace(/\.$/, '').trim();
  if (!text) return [DROPPED];
  const direct = lookup(text);
  if (direct.kind !== 'unsorted') return [direct];
  const q = splitQualifier(text);
  if (q) {
    if (ENTITY_QUALIFIERS.includes(q.qualifier)) return [DROPPED];
    return q.base ? [lookup(q.base)] : [DROPPED];
  }
  const suffix = /^(.+?)\s+(juvenile fiction|fiction)$/i.exec(text);
  if (suffix) return [lookup(suffix[1]), lookup(suffix[2])];
  return [direct];
}

/**
 * Library-catalogue headings: "Mars (Planet) -- Fiction.", "Fiction / Fantasy
 * / Epic", "Professional, career & trade -> computer science -> general",
 * "Fiction, thrillers, suspense", "Pizzolatto;Klim;noir". Split on the strong
 * separators first; a segment without a qualifier is then split on commas.
 */
function headingParts(raw) {
  const segments = String(raw).split(/\s*--\s*|\s+\/\s+|\s*->\s*|\s*;\s*|\s+-\s+/).filter((s) => s.trim());
  const parts = [];
  for (const seg of segments) {
    if (/\([^()]*\)\s*\.?$/.test(seg)) parts.push(seg);
    else parts.push(...seg.split(/\s*,\s*/).filter((s) => s.trim()));
  }
  return parts;
}

/**
 * One raw tag → `{ kind: 'mapped', tags }`, `{ kind: 'dropped' }` or
 * `{ kind: 'unsorted' }`.
 *
 * The whole string is looked up first, so an explicit entry (a considered
 * drop like "Romans, nouvelles", or a mapping like "Biography & Autobiography")
 * always wins. Otherwise a catalogue heading is split, and every part that
 * maps is kept; if none maps, the tag is dropped only when EVERY part is on
 * the drop list — anything else stays Unsorted, whole and as written.
 */
function classifyRawTag(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return DROPPED;
  const direct = lookup(raw);
  if (direct.kind !== 'unsorted') return direct;
  const parts = headingParts(raw);
  const results = (parts.length ? parts : [raw]).flatMap(lookupPart);
  const tags = [];
  for (const r of results) if (r.kind === 'mapped') for (const t of r.tags) if (!tags.includes(t)) tags.push(t);
  if (tags.length) return MAPPED(tags);
  if (results.every((r) => r.kind === 'dropped')) return DROPPED;
  return UNSORTED;
}

/** The canonical spelling of a tag name ("sci-fi" → "Sci-fi"), or null when it names no canonical tag. */
function canonicalTagName(value) {
  const key = normalizeTagTerm(value);
  return ALL_TAGS.find((t) => normalizeTagTerm(t) === key) ?? null;
}

/**
 * A book's raw tags → its derived fields.
 *   libraryTags: canonical, deduped, ordered by vocabulary group (Genre,
 *     Nonfiction, Audience, Flavour) then first appearance, capped at
 *     MAX_LIBRARY_TAGS — so a subject-heavy book loses Flavour first.
 *   unsortedTags: the raw tags that are neither mapped nor dropped, as
 *     written, deduped exactly, uncapped (nothing that might be Chef's is lost).
 * @param {string[]} rawTags
 * @returns {{ libraryTags: string[], unsortedTags: string[] }}
 */
function deriveTagFields(rawTags, { max = MAX_LIBRARY_TAGS } = {}) {
  const seen = new Map(); // canonical → first index
  const unsorted = [];
  let i = 0;
  for (const raw of Array.isArray(rawTags) ? rawTags : []) {
    const r = classifyRawTag(raw);
    if (r.kind === 'mapped') {
      for (const t of r.tags) if (!seen.has(t)) seen.set(t, i);
    } else if (r.kind === 'unsorted') {
      const text = raw.trim();
      if (!unsorted.includes(text)) unsorted.push(text);
    }
    i += 1;
  }
  const libraryTags = [...seen.entries()]
    .sort(([a, ai], [b, bi]) => GROUP_INDEX[a] - GROUP_INDEX[b] || ai - bi)
    .slice(0, max)
    .map(([tag]) => tag);
  return { libraryTags, unsortedTags: unsorted };
}

/**
 * Tags a person typed in BookGeek (Book.myTags): trimmed, blanks and exact
 * duplicates removed, otherwise exactly as typed — they show as-is under
 * "My tags" and are never mapped.
 */
function cleanMyTags(tags) {
  const out = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    if (typeof t !== 'string') continue;
    const text = t.trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/**
 * The canonical tags a filter or search term stands for: a canonical name
 * (any case) is itself; any other term is classified like a raw tag. A term
 * that maps to nothing gives [] and is matched as written instead.
 */
function canonicalTagsFor(term) {
  const name = canonicalTagName(term);
  if (name) return [name];
  const r = classifyRawTag(term);
  return r.kind === 'mapped' ? [...r.tags] : [];
}

/**
 * A saved view's tag list as the library names things now: a raw tag that
 * maps becomes its canonical tag(s) ("science fiction" → "Sci-fi"), a
 * canonical name gets its canonical spelling, and anything else — Unsorted,
 * My tags, a dropped tag — is kept exactly as saved (the filter still
 * matches it against the raw tags). Deduped, order kept.
 */
function mapViewTags(values) {
  const out = [];
  for (const v of Array.isArray(values) ? values : []) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const mapped = canonicalTagsFor(v);
    for (const t of mapped.length ? mapped : [v]) if (!out.includes(t)) out.push(t);
  }
  return out;
}

module.exports = {
  TAG_GROUPS,
  ALL_TAGS,
  TAG_SYNONYMS,
  MAX_LIBRARY_TAGS,
  MY_TAGS_GROUP,
  UNSORTED_GROUP,
  normalizeTagTerm,
  classifyRawTag,
  canonicalTagName,
  canonicalTagsFor,
  deriveTagFields,
  cleanMyTags,
  mapViewTags,
};
