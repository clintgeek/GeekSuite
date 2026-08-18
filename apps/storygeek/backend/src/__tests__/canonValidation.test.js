/**
 * canonValidationService invariants — the deterministic rules that keep
 * long campaigns coherent. The model is never the authority on these.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import canonValidationService from '../services/canonValidationService.js';
import stateCommitService from '../services/stateCommitService.js';

function makeStory() {
  return {
    title: 'Test', genre: 'Fantasy',
    worldState: { setting: 'Testland', currentSituation: 'testing', currentLocationName: 'Millhaven', turnNumber: 10 },
    characters: [
      { name: 'Kestrel', description: 'the player', isPlayer: true, status: 'alive', knowledge: [], relationships: [] },
      { name: 'Marta', description: 'innkeeper', status: 'alive', locationName: 'Millhaven', knowledge: [{ factId: 'fact_secret1', learnedVia: 'told', learnedFrom: 'Kestrel', turn: 5 }], relationships: [] },
      { name: 'Doran', description: 'guard captain', status: 'alive', locationName: 'Millhaven', knowledge: [], relationships: [] },
      { name: 'Garrick', description: 'bandit', status: 'dead', locationName: 'King\'s Road', knowledge: [], relationships: [] }
    ],
    locations: [
      { name: 'Millhaven', description: 'a village', state: 'intact', stateNotes: '' },
      { name: 'North Gate', description: 'the village gate', state: 'destroyed', stateNotes: 'smashed by an ogre' },
      { name: 'King\'s Road', description: 'the road east', state: 'intact', stateNotes: '' }
    ],
    storyThreads: [
      { name: 'Favor for Doran', description: 'Kestrel owes Doran a favor', type: 'promise', status: 'active', openedTurn: 8, updatedTurn: 8, characterNames: ['Doran'] },
      { name: 'The stolen shipment', description: 'resolved already', type: 'quest', status: 'resolved', resolution: 'found the thief', openedTurn: 2, updatedTurn: 6, characterNames: [] }
    ],
    storyState: {
      establishedFacts: [
        { id: 'fact_gate', category: 'location', fact: 'The North Gate of Millhaven was destroyed by an ogre', subjects: ['North Gate', 'Millhaven'], visibility: 'public', isRetired: false, turn: 3 },
        { id: 'fact_secret1', category: 'event', fact: 'Kestrel stole the mayor\'s seal', subjects: ['Kestrel'], visibility: 'secret', isRetired: false, turn: 5 }
      ],
      canonAlerts: []
    },
    events: [], diceResults: [], storySummaries: [],
    stats: { totalInteractions: 10, totalDiceRolls: 2 }
  };
}

describe('dead stays dead', () => {
  test('rejects resurrection without explicit revival', () => {
    const story = makeStory();
    const { accepted, rejected } = canonValidationService.validateProposal(story, {
      characterUpdates: [{ name: 'Garrick', status: 'alive' }]
    });
    assert.equal(accepted.characterUpdates.length, 0);
    assert.equal(rejected[0].rule, 'dead-stays-dead');
  });

  test('allows explicit revival', () => {
    const story = makeStory();
    const { accepted } = canonValidationService.validateProposal(story, {
      characterUpdates: [{ name: 'Garrick', status: 'alive', isRevival: true }]
    });
    assert.equal(accepted.characterUpdates.length, 1);
  });

  test('dead characters cannot move', () => {
    const story = makeStory();
    const { rejected } = canonValidationService.validateProposal(story, {
      characterUpdates: [{ name: 'Garrick', locationName: 'Millhaven' }]
    });
    assert.equal(rejected[0].rule, 'dead-stays-dead');
  });

  test('dead characters cannot learn', () => {
    const story = makeStory();
    const { rejected } = canonValidationService.validateProposal(story, {
      knowledgeGrants: [{ characterName: 'Garrick', factId: 'fact_gate', learnedVia: 'told', learnedFrom: 'Marta' }]
    });
    assert.equal(rejected[0].rule, 'know-dead');
  });
});

describe('destroyed stays destroyed', () => {
  test('rejects spontaneous repair', () => {
    const story = makeStory();
    const { rejected } = canonValidationService.validateProposal(story, {
      locationUpdates: [{ name: 'North Gate', state: 'intact' }]
    });
    assert.equal(rejected[0].rule, 'destroyed-stays-destroyed');
  });

  test('allows explicit rebuild', () => {
    const story = makeStory();
    const { accepted } = canonValidationService.validateProposal(story, {
      locationUpdates: [{ name: 'North Gate', state: 'intact', isRebuild: true }]
    });
    assert.equal(accepted.locationUpdates.length, 1);
  });
});

describe('knowledge flow', () => {
  test('rejects witnessing while absent', () => {
    const story = makeStory();
    const { rejected } = canonValidationService.validateProposal(story, {
      knowledgeGrants: [{ characterName: 'Doran', factId: 'fact_secret1', learnedVia: 'witnessed' }]
    }, { presentCharacterNames: ['Kestrel', 'Marta'] }); // Doran absent
    assert.equal(rejected[0].rule, 'know-not-present');
  });

  test('rejects knowledge with no vector', () => {
    const story = makeStory();
    const { rejected } = canonValidationService.validateProposal(story, {
      knowledgeGrants: [{ characterName: 'Doran', factId: 'fact_secret1', learnedVia: 'psychic' }]
    }, { presentCharacterNames: ['Doran'] });
    assert.equal(rejected[0].rule, 'know-no-vector');
  });

  test('rejects being told by someone who does not know', () => {
    const story = makeStory();
    const { rejected } = canonValidationService.validateProposal(story, {
      knowledgeGrants: [{ characterName: 'Marta', factId: 'fact_gate', learnedVia: 'told', learnedFrom: 'Doran' }]
    }, { presentCharacterNames: ['Marta', 'Doran'] });
    // Doran doesn't know fact_gate (his knowledge list is empty)
    assert.equal(rejected[0].rule, 'know-teller-ignorant');
  });

  test('accepts being told by someone who knows', () => {
    const story = makeStory();
    const { accepted } = canonValidationService.validateProposal(story, {
      knowledgeGrants: [{ characterName: 'Doran', factId: 'fact_secret1', learnedVia: 'told', learnedFrom: 'Marta' }]
    }, { presentCharacterNames: ['Marta', 'Doran'] });
    assert.equal(accepted.knowledgeGrants.length, 1);
  });

  test('accepts being told by the player without a knowledge check', () => {
    const story = makeStory();
    const { accepted } = canonValidationService.validateProposal(story, {
      knowledgeGrants: [{ characterName: 'Doran', factId: 'fact_gate', learnedVia: 'told', learnedFrom: 'Kestrel' }]
    }, { presentCharacterNames: ['Kestrel', 'Doran'] });
    assert.equal(accepted.knowledgeGrants.length, 1);
  });

  test('same-turn chain: new character can receive knowledge', () => {
    const story = makeStory();
    const { accepted } = canonValidationService.validateProposal(story, {
      newCharacters: [{ name: 'Fen', description: 'a merchant' }],
      knowledgeGrants: [{ characterName: 'Fen', factId: 'fact_gate', learnedVia: 'witnessed' }]
    }, { presentCharacterNames: ['Kestrel'] });
    assert.equal(accepted.newCharacters.length, 1);
    assert.equal(accepted.knowledgeGrants.length, 1);
  });
});

describe('threads', () => {
  test('resolved threads stay resolved', () => {
    const story = makeStory();
    const { rejected } = canonValidationService.validateProposal(story, {
      threadUpdates: [{ name: 'The stolen shipment', status: 'active' }]
    });
    assert.equal(rejected[0].rule, 'thread-reopen');
  });

  test('active threads can resolve', () => {
    const story = makeStory();
    const { accepted } = canonValidationService.validateProposal(story, {
      threadUpdates: [{ name: 'Favor for Doran', status: 'resolved', resolution: 'guarded the wall during the festival' }]
    });
    assert.equal(accepted.threadUpdates.length, 1);
  });
});

describe('fact contradictions', () => {
  test('contradicting fact becomes a conflict, not canon', () => {
    const story = makeStory();
    const { accepted, conflicts } = canonValidationService.validateProposal(story, {
      newFacts: [{ fact: 'The North Gate stands intact and welcoming', category: 'location', subjects: ['North Gate'] }]
    });
    assert.equal(accepted.newFacts.length, 0);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].existing.id, 'fact_gate');
  });

  test('duplicate facts are dropped silently', () => {
    const story = makeStory();
    const { accepted, rejected } = canonValidationService.validateProposal(story, {
      newFacts: [{ fact: 'The North Gate of Millhaven was destroyed by an ogre', category: 'location', subjects: ['North Gate'] }]
    });
    assert.equal(accepted.newFacts.length, 0);
    assert.equal(rejected.length, 0);
  });

  test('retiring a fact requires a reason', () => {
    const story = makeStory();
    const { rejected } = canonValidationService.validateProposal(story, {
      retiredFacts: [{ factId: 'fact_gate' }]
    });
    assert.equal(rejected[0].rule, 'retire-no-reason');
  });
});

describe('commit', () => {
  test('applies accepted changes and reports conflicts', () => {
    const story = makeStory();
    const report = stateCommitService.applyProposal(story, {
      newFacts: [
        { fact: 'Marta brews the best ale in the region', category: 'character', subjects: ['Marta'] },
        { fact: 'The North Gate is fully intact', category: 'location', subjects: ['North Gate'] } // conflict
      ],
      characterUpdates: [{ name: 'Doran', currentState: 'suspicious of the newcomer' }],
      newThreads: [{ name: 'The missing ale shipment', description: 'Marta\'s ale wagon vanished', type: 'quest', characterNames: ['Marta'] }]
    }, { presentCharacterNames: ['Kestrel', 'Marta', 'Doran'], turn: 11 });

    assert.ok(report.applied >= 3);
    assert.equal(report.conflicts.length, 1);
    assert.equal(story.storyState.establishedFacts.length, 3); // 2 + 1 new
    assert.equal(story.storyThreads.filter(t => t.status === 'active').length, 2);
    assert.equal(canonValidationService.findCharacter(story, 'Doran').currentState, 'suspicious of the newcomer');
    // The conflicting "gate intact" fact did NOT enter canon
    assert.ok(!story.storyState.establishedFacts.some(f => f.fact.includes('fully intact')));
  });

  test('knowledge grant referencing a same-turn fact resolves by text', () => {
    const story = makeStory();
    stateCommitService.applyProposal(story, {
      newFacts: [{ fact: 'A dragon was sighted over the eastern hills', category: 'event', subjects: ['eastern hills'] }],
      knowledgeGrants: [{ characterName: 'Marta', factText: 'A dragon was sighted over the eastern hills', learnedVia: 'told', learnedFrom: 'Kestrel' }]
    }, { presentCharacterNames: ['Kestrel', 'Marta'], turn: 11 });

    const marta = canonValidationService.findCharacter(story, 'Marta');
    const dragonFact = story.storyState.establishedFacts.find(f => f.fact.includes('dragon'));
    assert.ok(dragonFact, 'dragon fact committed');
    assert.ok(marta.knowledge.some(k => k.factId === dragonFact.id), 'Marta knows the dragon fact by id');
  });
});

describe('consistency audit', () => {
  test('clean story passes', () => {
    const story = makeStory();
    assert.equal(canonValidationService.auditStoryConsistency(story).length, 0);
  });

  test('detects dangling references', () => {
    const story = makeStory();
    story.characters[1].knowledge.push({ factId: 'fact_nonexistent', learnedVia: 'told', turn: 9 });
    story.worldState.currentLocationName = 'Atlantis';
    const violations = canonValidationService.auditStoryConsistency(story);
    assert.ok(violations.some(v => v.rule === 'knowledge-dangling'));
    assert.ok(violations.some(v => v.rule === 'current-location-dangling'));
  });
});
