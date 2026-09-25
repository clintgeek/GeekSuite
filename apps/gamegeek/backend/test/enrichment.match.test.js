/**
 * The strict matcher — apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Matching is strict.
 * "A wrong cover is worse than a title plate": every row that expects
 * no-match is a wrong cover this suite keeps off the shelf.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchCandidates, stripEditionSuffix, yearOf } from '../src/enrichment/match.js';
import { normalizeSteamSearchResults } from '../src/metadata/steam.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const doomSearch = normalizeSteamSearchResults(
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'steam-search-doom.json'), 'utf8'))
);

let seq = 0;
/** A candidate: title, optional year, optional id. */
const c = (title, year = null, providerId = String(++seq)) => ({
  provider: 'steam',
  providerId,
  title,
  releaseDate: year ? `${year}-06-01T00:00:00.000Z` : null,
});
const g = (title, year = null) => ({ title, releaseDate: year ? new Date(Date.UTC(year, 5, 1)) : null });

// [label, game, candidates, expected status, expected matched title (or null)]
const TABLE = [
  ['exact title', g('Hades'), [c('Hades')], 'matched', 'Hades'],
  ['™ on our side', g('DOOM™'), [c('DOOM')], 'matched', 'DOOM'],
  ['® on theirs', g("Tom Clancy's Rainbow Six Siege"), [c("Tom Clancy's Rainbow Six® Siege")], 'matched', "Tom Clancy's Rainbow Six® Siege"],
  ['LEGO® prefix', g('LEGO The Lord of the Rings'), [c('LEGO® The Lord of the Rings')], 'matched', 'LEGO® The Lord of the Rings'],
  ['case differs', g('Final Fantasy VII'), [c('FINAL FANTASY VII')], 'matched', 'FINAL FANTASY VII'],
  ['colon vs dash', g('XCOM: Chimera Squad'), [c('XCOM - Chimera Squad')], 'matched', 'XCOM - Chimera Squad'],
  ['colon vs nothing', g('XCOM 2: War of the Chosen'), [c('XCOM 2 War of the Chosen')], 'matched', 'XCOM 2 War of the Chosen'],
  ['& vs and', g('Ori & the Blind Forest'), [c('Ori and the Blind Forest')], 'matched', 'Ori and the Blind Forest'],
  ['DOOM against the real Steam search', g('DOOM'), doomSearch, 'matched', 'DOOM'],
  ['DOOM (1993) is not DOOM', g('DOOM (1993)'), [c('DOOM')], 'no-match', null],
  ['DOOM is not DOOM (1993)', g('DOOM'), [c('DOOM (1993)')], 'no-match', null],
  ["Director's Cut is not the base game", g('Death Stranding'), [c("DEATH STRANDING DIRECTOR'S CUT")], 'no-match', null],
  ["base game is not the Director's Cut", g("Death Stranding Director's Cut"), [c('Death Stranding')], 'no-match', null],
  ['The Final Cut is not the base game', g('Disco Elysium'), [c('Disco Elysium - The Final Cut')], 'no-match', null],
  ['sequel is not the original', g('Beholder 2'), [c('Beholder')], 'no-match', null],
  ['original among its sequels', g('Beholder'), [c('Beholder 2'), c('Beholder 3'), c('Beholder')], 'matched', 'Beholder'],
  ['Portal is not Portal 2', g('Portal'), [c('Portal 2')], 'no-match', null],
  ['roman numerals are left as-is', g('Final Fantasy VII'), [c('Final Fantasy 7')], 'no-match', null],
  ['accents are not folded', g('Pokémon'), [c('Pokemon')], 'no-match', null],
  ['GOTY Edition → base, second pass', g('The Witcher 3: Wild Hunt – Game of the Year Edition'), [c('The Witcher 3: Wild Hunt')], 'matched', 'The Witcher 3: Wild Hunt'],
  ['"- GOTY" suffix', g('Borderlands - GOTY'), [c('Borderlands')], 'matched', 'Borderlands'],
  ['base → Definitive Edition, second pass', g('Divinity: Original Sin 2'), [c('Divinity: Original Sin 2 - Definitive Edition')], 'matched', 'Divinity: Original Sin 2 - Definitive Edition'],
  ['Remastered, bare', g('Grim Fandango Remastered'), [c('Grim Fandango')], 'matched', 'Grim Fandango'],
  ['first pass wins over the second', g('Grim Fandango Remastered'), [c('Grim Fandango'), c('Grim Fandango Remastered')], 'matched', 'Grim Fandango Remastered'],
  ['second pass, two editions → ambiguous', g('Mafia Deluxe Edition'), [c('Mafia'), c('Mafia Complete Edition')], 'ambiguous', null],
  ['only ONE trailing edition word is dropped', g('Borderlands GOTY'), [c('Borderlands Game of the Year Enhanced')], 'no-match', null],
  ['Voidheart is not an edition word', g('Hollow Knight: Voidheart Edition'), [c('Hollow Knight')], 'no-match', null],
  ['a non-trailing "Remastered" stays', g('Tomb Raider I-III Remastered Starring Lara Croft'), [c('Tomb Raider I-III Remastered')], 'no-match', null],
  ['long exact title', g('Tomb Raider I-III Remastered Starring Lara Croft'), [c('Tomb Raider I-III Remastered Starring Lara Croft')], 'matched', 'Tomb Raider I-III Remastered Starring Lara Croft'],
  ['year +1 passes', g('Moonlighter', 2018), [c('Moonlighter', 2019)], 'matched', 'Moonlighter'],
  ['year -1 passes', g('Moonlighter', 2018), [c('Moonlighter', 2017)], 'matched', 'Moonlighter'],
  ['year off by 2 fails', g('Moonlighter', 2018), [c('Moonlighter', 2016)], 'no-match', null],
  ['no year on our side → title decides', g('Moonlighter'), [c('Moonlighter', 2016)], 'matched', 'Moonlighter'],
  ['no year on theirs → title decides', g('Moonlighter', 2018), [c('Moonlighter')], 'matched', 'Moonlighter'],
  ['same title, the year picks one', g('Prey', 2017), [c('Prey', 2006), c('Prey', 2017)], 'matched', 'Prey'],
  ['same title, both years fit → ambiguous', g('Prey', 2017), [c('Prey', 2017), c('Prey', 2018)], 'ambiguous', null],
  ['same title, no years → ambiguous', g('Prey'), [c('Prey'), c('Prey')], 'ambiguous', null],
  ['the year applies in the second pass too', g('Borderlands GOTY', 2010), [c('Borderlands', 2015)], 'no-match', null],
  ['the same result twice is one candidate', g('Hades'), [c('Hades', null, '42'), c('Hades', null, '42')], 'matched', 'Hades'],
  ['a title that is only an edition word', g('Deluxe'), [c('Deluxe')], 'matched', 'Deluxe'],
  ['no candidates', g('Hades'), [], 'no-match', null],
  ['candidates missing entirely', g('Hades'), null, 'no-match', null],
];

describe('matchCandidates — the table', () => {
  for (const [label, game, candidates, status, title] of TABLE) {
    test(label, () => {
      const result = matchCandidates(game, candidates);
      assert.equal(result.status, status, `${game.title} → ${JSON.stringify(result)}`);
      if (status === 'matched') assert.equal(result.candidate.title, title);
    });
  }

  test('the table has at least 25 rows', () => assert.ok(TABLE.length >= 25));
});

describe('matchCandidates — details', () => {
  test('reports which pass matched', () => {
    assert.equal(matchCandidates(g('Hades'), [c('Hades')]).pass, 1);
    assert.equal(matchCandidates(g('Grim Fandango Remastered'), [c('Grim Fandango')]).pass, 2);
  });

  test('ambiguous lists the candidates that tied', () => {
    const r = matchCandidates(g('Prey'), [c('Prey', null, 'a'), c('Prey', null, 'b'), c('Prey 2', null, 'c')]);
    assert.deepEqual(r.candidates.map((x) => x.providerId), ['a', 'b']);
  });

  test('DOOM among the recorded search picks Steam app 379720', () => {
    assert.equal(matchCandidates(g('DOOM', 2016), doomSearch).candidate.providerId, '379720');
  });
});

describe('stripEditionSuffix', () => {
  const cases = [
    ['The Witcher 3: Wild Hunt - Game of the Year Edition', 'The Witcher 3: Wild Hunt'],
    ['Borderlands GOTY', 'Borderlands'],
    ['Fallout 3 (GOTY)', 'Fallout 3'],
    ['Age of Empires II: Definitive Edition', 'Age of Empires II'],
    ['Dishonored Definitive', 'Dishonored'],
    ['Mafia Complete Edition', 'Mafia'],
    ['Skyrim Special Edition', 'Skyrim Special Edition'],
    ["Death Stranding Director's Cut", "Death Stranding Director's Cut"],
    ['Deluxe', 'Deluxe'],
  ];
  for (const [input, out] of cases) test(`${input} → ${out}`, () => assert.equal(stripEditionSuffix(input), out));
});

describe('yearOf', () => {
  test('Date, ISO string, number, junk', () => {
    assert.equal(yearOf(new Date(Date.UTC(2020, 0, 1))), 2020);
    assert.equal(yearOf('2019-12-31T00:00:00.000Z'), 2019);
    assert.equal(yearOf(2018), 2018);
    assert.equal(yearOf(null), null);
    assert.equal(yearOf('not a date'), null);
  });
});
