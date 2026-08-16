/**
 * canonQueryService — canon questions are answered from the RECORD with
 * provenance, never by the creative GM. Detection must catch questions to
 * the engine while never intercepting in-fiction actions.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import canonQueryService from '../services/canonQueryService.js';
import stateCommitService from '../services/stateCommitService.js';

function makeStory() {
  return {
    title: 'The Reboot', genre: 'Post-Apocalyptic',
    worldState: { currentLocationName: 'Service Trail', turnNumber: 6, setting: 'ash country' },
    characters: [
      { name: 'Johnathan', isPlayer: true, status: 'alive', description: 'a survivor', knowledge: [], relationships: [], isActive: true },
      { name: 'The Kid', status: 'alive', description: 'a silent child', locationName: 'Service Trail', knowledge: [], relationships: [], isActive: true }
    ],
    locations: [
      { name: 'Service Trail', description: 'a steep maintenance road', state: 'intact' },
      { name: 'The Facility', description: 'an underground research site', state: 'destroyed', stateNotes: 'consumed by the blast' }
    ],
    storyThreads: [
      { name: 'The silent kid', description: 'Who is the child, and what did they see?', type: 'secret', status: 'active', characterNames: ['The Kid'], openedTurn: 2, updatedTurn: 5 }
    ],
    storyState: {
      establishedFacts: [
        { id: 'f1', category: 'detail', fact: "Jim's truck is a 4x4", subjects: ["Jim's truck"], visibility: 'public', source: 'player', turn: 2, isRetired: false },
        { id: 'f2', category: 'detail', fact: "Jim's truck was parked in spot 22C with the keys left in it", subjects: ["Jim's truck", 'Jim'], visibility: 'public', source: 'setup', turn: 1, isRetired: false },
        { id: 'f3', category: 'detail', fact: "Jim's truck has a slate gray interior", subjects: ["Jim's truck"], visibility: 'public', source: 'narrator', turn: 5, isRetired: false },
        { id: 'f4', category: 'event', fact: 'The Facility was destroyed in the blast', subjects: ['The Facility'], visibility: 'public', source: 'narrator', turn: 1, isRetired: false },
        { id: 'f5', category: 'detail', fact: 'A retired detail', subjects: ["Jim's truck"], visibility: 'public', source: 'narrator', turn: 3, isRetired: true, retiredReason: 'superseded' }
      ],
      canonAlerts: []
    },
    events: [], diceResults: [], storySummaries: [],
    stats: { totalInteractions: 6 }
  };
}

describe('canon query detection', () => {
  const yes = [
    'What all do we know about Jim\'s truck?',
    'what do we know about the Facility',
    'What did we actually know before I asked about the interior?',
    'What have we learned about the kid?',
    'Remind me what happened at the facility',
    'recap',
    '/recall Jim\'s truck',
    '/canon the kid'
  ];
  const no = [
    'I ask the guard what he knows about the seal',   // in-fiction action
    'I drive the truck south',
    'I wonder what the kid knows',                    // starts with I — action
    'Attack the bandit',
    'What is that sound coming from the trees?'       // in-fiction question to the scene
  ];
  for (const q of yes) {
    test(`detects: "${q}"`, () => assert.equal(canonQueryService.isCanonQuery(q), true));
  }
  for (const q of no) {
    test(`passes through: "${q}"`, () => assert.equal(canonQueryService.isCanonQuery(q), false));
  }
});

describe('canon retrieval', () => {
  test('subject query returns only that subject\'s live facts, timeline order, with provenance', async () => {
    const story = makeStory();
    const payload = await canonQueryService.answerCanonQuery(story, "What all do we know about Jim's truck?");
    assert.equal(payload.type, 'canon_answer');
    const texts = payload.facts.map(f => f.text);
    assert.ok(texts.includes("Jim's truck is a 4x4"));
    assert.ok(texts.includes("Jim's truck has a slate gray interior"));
    assert.ok(!texts.includes('A retired detail'), 'retired facts never surface');
    assert.ok(!texts.some(t => t.includes('Facility was destroyed')), 'unrelated facts excluded');
    // Timeline order (oldest first)
    const turns = payload.facts.map(f => f.turn);
    assert.deepEqual([...turns].sort((a, b) => a - b), turns);
    // Provenance separation — the whole point
    const bySource = Object.fromEntries(payload.facts.map(f => [f.text, f.source]));
    assert.equal(bySource["Jim's truck is a 4x4"], 'player');
    assert.equal(bySource["Jim's truck has a slate gray interior"], 'narrator');
  });

  test('entity query includes canonical entity card and related threads', async () => {
    const story = makeStory();
    const payload = await canonQueryService.answerCanonQuery(story, 'What do we know about The Kid?');
    const card = payload.entities.find(e => e.name === 'The Kid');
    assert.ok(card, 'entity card present');
    assert.equal(card.status, 'alive');
    assert.ok(payload.threads.some(t => t.name === 'The silent kid'), 'related thread surfaced');
  });

  test('destroyed location card carries canonical state', async () => {
    const story = makeStory();
    const payload = await canonQueryService.answerCanonQuery(story, 'Remind me about The Facility');
    const card = payload.entities.find(e => e.name === 'The Facility');
    assert.equal(card.state, 'destroyed');
  });

  test('recap (no subject) returns recent facts and active threads', async () => {
    const story = makeStory();
    const payload = await canonQueryService.answerCanonQuery(story, 'recap');
    assert.ok(payload.facts.length >= 4);
    assert.ok(payload.threads.every(t => t.status === 'active'));
  });

  test('unknown subject yields empty facts and an honest summary', async () => {
    const story = makeStory();
    const payload = await canonQueryService.answerCanonQuery(story, 'What do we know about the Obsidian Crown?');
    assert.equal(payload.facts.length, 0);
    assert.match(payload.summary, /nothing about that has been established/i);
  });

  test('offline fallback summary attributes by source', async () => {
    const story = makeStory();
    // No auth token in tests → aux call fails → deterministic fallback.
    const payload = await canonQueryService.answerCanonQuery(story, "What do we know about Jim's truck?");
    assert.match(payload.summary, /you established/i);
    assert.match(payload.summary, /narrator/i);
  });
});

describe('provenance through commit', () => {
  test('player-origin facts record source=player; narrator-origin source=narrator; setup override wins', () => {
    const story = makeStory();
    stateCommitService.applyProposal(story, {
      newFacts: [
        { fact: 'The truck radio still works', category: 'detail', subjects: ["Jim's truck"], origin: 'player' },
        { fact: 'The route sign points to Hollow Creek', category: 'detail', subjects: ['Hollow Creek'], origin: 'narrator' }
      ]
    }, { presentCharacterNames: ['Johnathan'], turn: 7 });

    const radio = story.storyState.establishedFacts.find(f => f.fact.includes('radio'));
    const sign = story.storyState.establishedFacts.find(f => f.fact.includes('route sign'));
    assert.equal(radio.source, 'player');
    assert.equal(sign.source, 'narrator');

    stateCommitService.applyProposal(story, {
      newFacts: [{ fact: 'The world ended on a Tuesday', category: 'event', subjects: [], origin: 'narrator' }]
    }, { presentCharacterNames: [], turn: 1, sourceOverride: 'setup' });
    const seeded = story.storyState.establishedFacts.find(f => f.fact.includes('Tuesday'));
    assert.equal(seeded.source, 'setup');
  });
});
