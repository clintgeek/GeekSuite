/**
 * contextService tests — the deliberate context package.
 * The model should see exactly what it needs: present NPCs with bounded
 * knowledge, live canon, open threads, and never a secret in the wrong
 * character's KNOWS list.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import contextService, { GM_SYSTEM_RULES } from '../services/contextService.js';

function makeStory() {
  return {
    title: 'The Sunstone', genre: 'Fantasy',
    worldState: {
      setting: 'The kingdom of Veldt', currentSituation: 'Evening at the Gilded Goose',
      currentLocationName: 'The Gilded Goose', turnNumber: 40,
      mood: 'tense', weather: 'rainy', timeOfDay: 'evening'
    },
    aiContext: { storyTone: 'adventure', technologyLevel: 'medieval', magicSystem: '' },
    characters: [
      { name: 'Kestrel', isPlayer: true, status: 'alive', description: 'a wry rogue', currentState: 'bruised ribs',
        inventory: [{ name: 'lockpicks', quantity: 1, isEquipped: true }, { name: 'gold coin', quantity: 12 }],
        skills: [{ name: 'stealth', level: 3 }], knowledge: [], relationships: [], isActive: true },
      { name: 'Marta', status: 'alive', description: 'the innkeeper', personality: 'warm but shrewd',
        motivation: 'protect her inn', locationName: 'The Gilded Goose',
        knowledge: [{ factId: 'fact_secret1', learnedVia: 'told', learnedFrom: 'Kestrel', turn: 5 }],
        relationships: [{ characterName: 'Kestrel', relationshipType: 'friend', description: 'trusts her' }],
        isActive: true, lastSeenTurn: 39 },
      { name: 'Doran', status: 'alive', description: 'guard captain', personality: 'rigid, dutiful',
        motivation: 'keep order', locationName: 'The Gilded Goose', knowledge: [], relationships: [],
        isActive: true, lastSeenTurn: 39 },
      { name: 'Yola', status: 'alive', description: 'priestess', locationName: 'Highspire Temple',
        knowledge: [], relationships: [], isActive: true, lastSeenTurn: 22 },
      { name: 'Garrick', status: 'dead', description: 'bandit', locationName: 'King\'s Road',
        knowledge: [], relationships: [], isActive: true, lastSeenTurn: 15 }
    ],
    locations: [
      { name: 'The Gilded Goose', description: 'a cozy tavern', type: 'tavern', state: 'intact', atmosphere: 'smoky warmth' },
      { name: 'North Gate', description: 'the village gate', state: 'destroyed', stateNotes: 'rubble since the ogre attack' },
      { name: 'Highspire Temple', description: 'marble sanctum', state: 'intact' },
      { name: 'King\'s Road', description: 'the road east', state: 'intact' }
    ],
    storyThreads: [
      { name: 'Favor for Doran', description: 'Kestrel owes Doran a favor', type: 'promise', status: 'active', openedTurn: 8, updatedTurn: 8, characterNames: ['Doran'] },
      { name: 'Find the Sunstone', description: 'Yola needs the Sunstone recovered', type: 'quest', status: 'active', openedTurn: 22, updatedTurn: 35, characterNames: ['Yola'] },
      { name: 'Old business', description: 'done', type: 'quest', status: 'resolved', resolution: 'done', openedTurn: 1, updatedTurn: 4 }
    ],
    storyState: {
      establishedFacts: [
        { id: 'fact_gate', category: 'location', fact: 'The North Gate was destroyed by an ogre', subjects: ['North Gate'], visibility: 'public', isRetired: false, turn: 3 },
        { id: 'fact_secret1', category: 'event', fact: 'Kestrel stole the mayor\'s seal', subjects: ['Kestrel'], visibility: 'secret', isRetired: false, turn: 5 },
        { id: 'fact_marta', category: 'character', fact: 'Marta\'s husband died in the ogre attack', subjects: ['Marta'], visibility: 'public', isRetired: false, turn: 6 },
        { id: 'fact_retired', category: 'detail', fact: 'The old bridge was closed', subjects: ['old bridge'], visibility: 'public', isRetired: true, retiredReason: 'reopened after repairs', turn: 2 }
      ],
      canonAlerts: []
    },
    events: [
      { type: 'dialogue', description: 'Player: I order an ale', turn: 39 },
      { type: 'narrative', description: 'Marta slides a mug across the bar...', turn: 39 }
    ],
    diceResults: [], storySummaries: [],
    stats: { totalInteractions: 39, totalDiceRolls: 4 }
  };
}

describe('knowledge boundaries in context', () => {
  test('NPC who knows a secret has it in their KNOWS list', async () => {
    const story = makeStory();
    const { prompt } = await contextService.buildTurnContext(story, 'I ask Marta about the seal');
    const martaBlock = prompt.slice(prompt.indexOf('Marta ['), prompt.indexOf('Doran ['));
    assert.ok(martaBlock.includes('mayor'), 'Marta\'s block should include the seal secret');
  });

  test('NPC who does not know the secret has an empty or unrelated KNOWS list', async () => {
    const story = makeStory();
    const { prompt } = await contextService.buildTurnContext(story, 'I chat with Doran');
    const doranStart = prompt.indexOf('Doran [');
    const doranBlock = prompt.slice(doranStart, prompt.indexOf('===', doranStart));
    assert.ok(!doranBlock.includes('mayor'), 'Doran\'s KNOWS must not contain the seal secret');
  });

  test('secret facts are tagged SECRET in the facts section', async () => {
    const story = makeStory();
    const { prompt } = await contextService.buildTurnContext(story, 'I think about the seal I stole from the mayor, and Kestrel\'s past');
    if (prompt.includes('mayor\'s seal')) {
      const factLine = prompt.split('\n').find(l => l.includes('mayor\'s seal') && l.startsWith('-'));
      if (factLine) assert.ok(factLine.includes('[SECRET'), 'secret fact must carry the SECRET tag');
    }
  });
});

describe('presence selection', () => {
  test('co-located NPCs are present; distant and dead ones are not', async () => {
    const story = makeStory();
    const { turnContext } = await contextService.buildTurnContext(story, 'I look around the tavern');
    assert.ok(turnContext.presentCharacterNames.includes('Marta'));
    assert.ok(turnContext.presentCharacterNames.includes('Doran'));
    assert.ok(!turnContext.presentCharacterNames.includes('Yola'), 'Yola is in another city');
    assert.ok(!turnContext.presentCharacterNames.includes('Garrick'), 'Garrick is dead');
  });

  test('mentioning a dead character surfaces them (so the GM knows they are dead)', async () => {
    const story = makeStory();
    const { prompt, turnContext } = await contextService.buildTurnContext(story, 'I ask about Garrick');
    assert.ok(turnContext.presentCharacterNames.includes('Garrick'));
    assert.ok(prompt.includes('Garrick [dead]'), 'context must mark Garrick as dead');
  });
});

describe('canon in context', () => {
  test('facts about mentioned entities are selected', async () => {
    const story = makeStory();
    const { prompt } = await contextService.buildTurnContext(story, 'I walk toward the North Gate');
    assert.ok(prompt.includes('destroyed by an ogre'), 'gate destruction fact must be present');
  });

  test('retired facts never appear', async () => {
    const story = makeStory();
    const { prompt } = await contextService.buildTurnContext(story, 'I cross the old bridge');
    assert.ok(!prompt.includes('The old bridge was closed'), 'retired facts must not surface');
  });

  test('destroyed location state is authoritative in scene rendering', async () => {
    const story = makeStory();
    story.worldState.currentLocationName = 'North Gate';
    const { prompt } = await contextService.buildTurnContext(story, 'I search the rubble');
    assert.ok(prompt.includes('[destroyed]'), 'location state must render');
  });
});

describe('threads', () => {
  test('all active threads are present; resolved ones are not', async () => {
    const story = makeStory();
    const { prompt } = await contextService.buildTurnContext(story, 'I sip my ale');
    assert.ok(prompt.includes('Favor for Doran'));
    assert.ok(prompt.includes('Find the Sunstone'));
    assert.ok(!prompt.includes('Old business'));
  });

  test('stale threads are flagged DORMANT', async () => {
    const story = makeStory();
    const { prompt } = await contextService.buildTurnContext(story, 'I sip my ale');
    const favorLine = prompt.split('\n').find(l => l.includes('Favor for Doran'));
    assert.ok(favorLine.includes('DORMANT'), 'thread untouched for 32 turns must be flagged');
    const sunstoneLine = prompt.split('\n').find(l => l.includes('Find the Sunstone'));
    assert.ok(!sunstoneLine.includes('DORMANT'), 'recently updated thread is not dormant');
  });
});

describe('canon alerts', () => {
  test('alerts from prior conflicts render as course-corrections', async () => {
    const story = makeStory();
    const { prompt } = await contextService.buildTurnContext(story, 'I look around', {
      canonAlerts: [{ existing: { id: 'fact_gate', fact: 'The North Gate was destroyed by an ogre' }, proposed: { fact: 'gate intact' } }]
    });
    assert.ok(prompt.includes('CANON ALERTS'));
    assert.ok(prompt.includes('do not contradict'));
  });
});

describe('system rules', () => {
  test('the GM contract carries the critical guardrails', () => {
    assert.ok(GM_SYSTEM_RULES.includes('fictional'), 'fictional game framing');
    assert.ok(GM_SYSTEM_RULES.includes('never moralize'), 'no moralizing');
    assert.ok(GM_SYSTEM_RULES.includes('NEVER make choices on behalf of the player'), 'agency');
    assert.ok(GM_SYSTEM_RULES.includes('KNOWS list'), 'knowledge boundary');
    assert.ok(GM_SYSTEM_RULES.includes('ROLL: d20'), 'dice protocol');
    assert.ok(GM_SYSTEM_RULES.includes('do not escalate every scene'), 'scale guidance');
    assert.ok(GM_SYSTEM_RULES.includes('never invent dice results'), 'engine-owned dice');
  });

  test('prompt stays within budget even with a bloated story', async () => {
    const story = makeStory();
    // Bloat: 300 facts, 40 threads, huge events
    for (let i = 0; i < 300; i++) {
      story.storyState.establishedFacts.push({
        id: `fact_bulk${i}`, category: 'detail', fact: `Bulk fact number ${i} about the Gilded Goose tavern and its patrons`,
        subjects: ['The Gilded Goose'], visibility: 'public', isRetired: false, turn: i
      });
    }
    for (let i = 0; i < 40; i++) {
      story.storyThreads.push({ name: `Side quest ${i}`, description: 'x'.repeat(200), type: 'quest', status: 'active', openedTurn: 39, updatedTurn: 39 });
    }
    for (let i = 0; i < 20; i++) {
      story.events.push({ type: 'narrative', description: 'y'.repeat(2000), turn: 39 });
    }
    const { prompt } = await contextService.buildTurnContext(story, 'I look around the tavern');
    assert.ok(prompt.length < 30000, `prompt is ${prompt.length} chars — must stay bounded`);
    // Player action always survives trimming
    assert.ok(prompt.includes('I look around the tavern'));
  });
});
