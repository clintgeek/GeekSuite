/**
 * Long-running campaign harness — ~100 turns of deterministic play driving
 * the REAL continuity pipeline (context builder → commit → validation →
 * checkpoints), with scripted narrations and extraction proposals standing
 * in for the AI.
 *
 * The scenario deliberately sets every drift trap from the continuity spec:
 *   - a fact established early (destroyed gate) revisited ~60 turns later
 *   - a secret told to exactly one NPC, verified never to leak to another
 *   - an NPC killed mid-campaign who must stay dead
 *   - a promise thread left dormant for dozens of turns that must resurface
 *   - a resolved thread that must stay resolved
 *   - a contradiction injected mid-campaign that must bounce off canon
 *   - checkpoint at turn 20, play on, restore, verify state, keep playing
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import contextService from '../services/contextService.js';
import stateCommitService from '../services/stateCommitService.js';
import canonValidationService from '../services/canonValidationService.js';
import checkpointService from '../services/checkpointService.js';
import canonQueryService from '../services/canonQueryService.js';
import diceService from '../services/diceService.js';

/** Minimal engine mirroring storyController's turn pipeline, minus HTTP/AI. */
async function playTurn(story, playerInput, narration, proposal = null) {
  const turn = (story.worldState.turnNumber || 0) + 1;
  story.worldState.turnNumber = turn;
  story.events.push({ type: 'dialogue', description: `Player: ${playerInput}`, turn, timestamp: new Date() });

  const canonAlerts = story.storyState?.canonAlerts || [];
  const { prompt, turnContext } = await contextService.buildTurnContext(story, playerInput, { canonAlerts });

  story.events.push({ type: 'narrative', description: narration, turn, timestamp: new Date() });
  story.stats.totalInteractions++;

  let report = { applied: 0, rejected: [], conflicts: [] };
  if (proposal) {
    report = stateCommitService.applyProposal(story, proposal, {
      presentCharacterNames: turnContext.presentCharacterNames, turn
    });
  }
  story.storyState.canonAlerts = report.conflicts.slice(0, 5).map(c => ({
    existing: { id: c.existing?.id, fact: c.existing?.fact },
    proposed: { fact: c.proposed?.fact }
  }));

  return { turn, prompt, turnContext, report };
}

/** Extract one NPC's block from the CHARACTERS PRESENT section of a prompt. */
function npcBlock(prompt, name) {
  const secStart = prompt.indexOf('=== CHARACTERS PRESENT IN SCENE ===');
  if (secStart === -1) return null;
  const secEnd = prompt.indexOf('\n===', secStart + 10);
  const section = prompt.slice(secStart, secEnd === -1 ? undefined : secEnd);
  const blocks = section.split('\n\n');
  return blocks.find(b => b.startsWith(`${name} [`) || b.includes(`\n${name} [`)) || null;
}

function freshStory() {
  return {
    title: 'The Millhaven Campaign', genre: 'Fantasy',
    worldState: {
      setting: 'The kingdom of Veldt, a land of river towns and old roads',
      currentSituation: 'Story has begun', currentLocationName: '', turnNumber: 0,
      mood: 'neutral', weather: 'clear', timeOfDay: 'morning'
    },
    aiContext: { storyTone: 'adventure', technologyLevel: 'medieval', magicSystem: '' },
    characters: [], locations: [], storyThreads: [],
    storyState: { establishedFacts: [], activeCharacters: [], currentLocation: {}, canonAlerts: [] },
    events: [], diceResults: [], storySummaries: [], checkpoints: [],
    stats: { totalInteractions: 0, totalDiceRolls: 0 }
  };
}

test('100-turn campaign: canon survives, knowledge stays bounded, checkpoints restore', async () => {
  const story = freshStory();

  // ── Turn 1: opening — player + village + NPCs ────────────────────────
  await playTurn(story, 'I am Kestrel, a rogue. I arrive in Millhaven at dusk.',
    'Kestrel walks into Millhaven as lamps are lit. At the Gilded Goose inn, Marta the innkeeper greets travelers while Doran, the guard captain, watches from a corner.',
    {
      playerCharacter: { name: 'Kestrel', description: 'a wry rogue with quick hands' },
      newLocations: [
        { name: 'Millhaven', description: 'a river town of moss-tiled roofs', type: 'village' },
        { name: 'The Gilded Goose', description: 'a cozy inn on the square', type: 'tavern' }
      ],
      newCharacters: [
        { name: 'Marta', description: 'the innkeeper', personality: 'warm but shrewd', motivation: 'protect her inn and its regulars', locationName: 'The Gilded Goose' },
        { name: 'Doran', description: 'guard captain', personality: 'rigid, dutiful, slow to trust', motivation: 'keep order in Millhaven', locationName: 'The Gilded Goose' }
      ],
      sceneUpdate: { locationName: 'The Gilded Goose', situation: 'Kestrel settles into the Gilded Goose at dusk', timeOfDay: 'evening' }
    });

  assert.ok(story.characters.find(c => c.isPlayer)?.name === 'Kestrel', 'player character seeded');
  assert.equal(story.worldState.currentLocationName, 'The Gilded Goose');

  // ── Turn 2-3: the gate is destroyed — a fact that must survive 60+ turns ──
  await playTurn(story, 'I ask what the commotion outside was',
    'A crash echoes — an ogre has smashed through the North Gate, leaving it in rubble before being driven off. Marta and Doran rush to the windows.',
    {
      newLocations: [{ name: 'North Gate', description: 'the fortified north entrance of Millhaven', type: 'other' }],
      newFacts: [{ fact: 'The North Gate of Millhaven was destroyed by an ogre', category: 'location', subjects: ['North Gate', 'Millhaven'], visibility: 'public', origin: 'narrator' }],
      locationUpdates: [{ name: 'North Gate', state: 'destroyed', stateNotes: 'reduced to rubble by an ogre' }],
      knowledgeGrants: [
        { characterName: 'Marta', factText: 'The North Gate of Millhaven was destroyed by an ogre', learnedVia: 'witnessed' },
        { characterName: 'Doran', factText: 'The North Gate of Millhaven was destroyed by an ogre', learnedVia: 'witnessed' }
      ]
    });

  const gateFact = story.storyState.establishedFacts.find(f => f.fact.includes('North Gate'));
  assert.ok(gateFact, 'gate destruction is canon');
  assert.equal(canonValidationService.findLocation(story, 'North Gate').state, 'destroyed');

  // ── Turn 4: the secret — told to Marta ONLY ─────────────────────────
  await playTurn(story, 'I quietly confess to Marta that I stole the mayor\'s seal in Highspire',
    'Marta\'s eyes widen. She leans in. "That seal means a noose if the wrong ears hear it. Your secret stays behind my bar."',
    {
      newFacts: [{ fact: 'Kestrel stole the mayor\'s seal in Highspire', category: 'event', subjects: ['Kestrel'], visibility: 'secret', origin: 'player' }],
      knowledgeGrants: [{ characterName: 'Marta', factText: 'Kestrel stole the mayor\'s seal in Highspire', learnedVia: 'told', learnedFrom: 'Kestrel' }]
    });

  const sealFact = story.storyState.establishedFacts.find(f => f.fact.includes('seal'));
  assert.equal(sealFact.visibility, 'secret');
  assert.ok(canonValidationService.findCharacter(story, 'Marta').knowledge.some(k => k.factId === sealFact.id));
  assert.ok(!canonValidationService.findCharacter(story, 'Doran').knowledge.some(k => k.factId === sealFact.id));

  // ── Turn 5: the promise thread (will go dormant) ────────────────────
  await playTurn(story, 'I promise Doran I will help guard the gate ruins during the festival',
    'Doran grunts approval. "The festival brings pickpockets and worse. I\'ll hold you to that, rogue."',
    {
      newThreads: [{ name: 'Festival watch for Doran', description: 'Kestrel promised to help Doran guard the ruined North Gate during the festival', type: 'promise', characterNames: ['Doran'] }],
      relationshipUpdates: [{ name: 'Doran', otherName: 'Kestrel', relationshipType: 'neutral', description: 'cautiously accepts Kestrel\'s promise' }]
    });

  // ── Turns 6-14: travel to Highspire; meet Fen, Yola, Garrick ────────
  await playTurn(story, 'I set out on the King\'s Road toward Highspire',
    'The road east winds through wet hills.',
    {
      newLocations: [{ name: 'King\'s Road', description: 'the old trade road east', type: 'wilderness' }],
      sceneUpdate: { locationName: 'King\'s Road', situation: 'Kestrel travels east on the King\'s Road' }
    });

  await playTurn(story, 'I keep walking and watch the treeline',
    'A lean figure steps from the trees — Garrick, a bandit with a notched blade, demanding toll.',
    {
      newCharacters: [{ name: 'Garrick', description: 'a bandit with a notched blade', personality: 'greedy, cowardly when outmatched', motivation: 'easy coin', locationName: 'King\'s Road' }]
    });

  // Turn 8: dice-gated combat — the engine rolls, never the model.
  const combatRoll = diceService.rollForSituation('combat');
  assert.ok(combatRoll.result >= 1 && combatRoll.result <= 20, 'engine dice are real dice');
  story.diceResults.push(combatRoll);
  story.stats.totalDiceRolls++;
  await playTurn(story, 'I fight Garrick rather than pay',
    'Steel rings on the wet road. Kestrel wins through, leaving Garrick dead in the ditch.',
    {
      characterUpdates: [{ name: 'Garrick', status: 'dead', currentState: 'dead in a ditch off the King\'s Road' }],
      newFacts: [{ fact: 'Garrick the bandit was killed by Kestrel on the King\'s Road', category: 'event', subjects: ['Garrick', 'Kestrel'], visibility: 'public' }]
    });
  assert.equal(canonValidationService.findCharacter(story, 'Garrick').status, 'dead');

  await playTurn(story, 'I continue to Highspire and find an inn',
    'Highspire\'s white walls rise over the valley. In the market quarter, Fen the merchant hawks southern silks; at the temple, priestess Yola tends the eternal flame.',
    {
      newLocations: [
        { name: 'Highspire', description: 'the walled trade city', type: 'city' },
        { name: 'Highspire Temple', description: 'marble sanctum of the flame', type: 'temple' }
      ],
      newCharacters: [
        { name: 'Fen', description: 'a silk merchant', personality: 'chatty, opportunistic', motivation: 'profit and gossip', locationName: 'Highspire' },
        { name: 'Yola', description: 'priestess of the flame', personality: 'serene, exacting', motivation: 'recover the temple\'s relics', locationName: 'Highspire Temple' }
      ],
      sceneUpdate: { locationName: 'Highspire', situation: 'Kestrel arrives in Highspire' }
    });

  // Turn 10: the quest thread
  await playTurn(story, 'I visit the temple and ask Yola about work',
    'Yola studies Kestrel. "The Sunstone was taken from our altar. Return it, and the temple pays in gold and gratitude."',
    {
      newThreads: [{ name: 'Find the Sunstone', description: 'Yola hired Kestrel to recover the stolen Sunstone from the temple altar', type: 'quest', characterNames: ['Yola'] }],
      newFacts: [{ fact: 'The Sunstone was stolen from the Highspire Temple altar', category: 'event', subjects: ['Sunstone', 'Highspire Temple'], visibility: 'public' }],
      knowledgeGrants: [{ characterName: 'Yola', factText: 'The Sunstone was stolen from the Highspire Temple altar', learnedVia: 'witnessed' }],
      sceneUpdate: { locationName: 'Highspire Temple', situation: 'Yola has hired Kestrel to find the Sunstone' }
    });

  // ── Turns 11-19: filler in Highspire (context should stay bounded) ──
  for (let i = 0; i < 9; i++) {
    const { prompt } = await playTurn(story, `I ask around the market about the Sunstone (day ${i + 1})`,
      'Rumors swirl but nothing solid surfaces.',
      { sceneUpdate: { situation: `Kestrel works the Highspire markets for Sunstone leads, day ${i + 1}` } });
    assert.ok(prompt.length < 30000, 'context stays bounded during filler');
  }

  // ── Turn 20: CHECKPOINT ─────────────────────────────────────────────
  const checkpoint = checkpointService.makeCheckpoint(story, 'before the vault');
  story.checkpoints.push(checkpoint);
  assert.equal(checkpoint.turnNumber, story.worldState.turnNumber);
  const factCountAtCheckpoint = story.storyState.establishedFacts.length;
  const turnAtCheckpoint = story.worldState.turnNumber;

  // ── Turn 21: DRIFT ATTACK #1 — dead man walking must be rejected ────
  {
    const { report } = await playTurn(story, 'I look around the tavern',
      'In the corner, Garrick sharpens his notched blade and grins.', // drifted narration!
      { characterUpdates: [{ name: 'Garrick', status: 'alive', locationName: 'Highspire' }] });
    assert.ok(report.rejected.some(r => r.rule === 'dead-stays-dead'), 'resurrection rejected');
    assert.equal(canonValidationService.findCharacter(story, 'Garrick').status, 'dead', 'Garrick is still dead');
  }

  // ── Turn 22: DRIFT ATTACK #2 — contradicting the gate fact ──────────
  {
    const { report } = await playTurn(story, 'I think of home',
      'Back in Millhaven, travelers stream through the proud North Gate.', // drifted narration!
      { newFacts: [{ fact: 'The North Gate of Millhaven stands intact', category: 'location', subjects: ['North Gate'] }] });
    assert.equal(report.conflicts.length, 1, 'contradiction surfaced as conflict');
    assert.ok(!story.storyState.establishedFacts.some(f => f.fact.includes('stands intact')), 'contradiction did not enter canon');
  }

  // Turn 23: the canon alert reaches the GM prompt
  {
    const { prompt } = await playTurn(story, 'I finish my drink', 'The ale is bitter and good.', null);
    assert.ok(prompt.includes('CANON ALERTS'), 'GM sees the course-correction');
    assert.ok(prompt.includes('destroyed by an ogre'), 'alert cites the real fact');
  }

  // ── Turn 24: DRIFT ATTACK #3 — NPC knowledge leak must be rejected ──
  {
    const { report } = await playTurn(story, 'I pass Fen\'s stall',
      'Fen winks. "Heard about a certain mayor\'s seal, friend."', // leak!
      { knowledgeGrants: [{ characterName: 'Fen', factId: sealFact.id, learnedVia: 'witnessed' }] });
    assert.ok(report.rejected.some(r => r.rule === 'know-not-present' || r.rule === 'know-witness-old-fact'), 'leak vector rejected');
    assert.ok(!canonValidationService.findCharacter(story, 'Fen').knowledge.some(k => k.factId === sealFact.id), 'Fen does not know the secret');
  }

  // ── Turns 25-38: progress the Sunstone quest; more filler ───────────
  await playTurn(story, 'I break into the smugglers\' den at night',
    'Among crates of stolen goods, the Sunstone glows faintly in a lockbox.',
    {
      threadUpdates: [{ name: 'Find the Sunstone', progressNote: 'located the Sunstone in the smugglers\' den' }],
      newFacts: [{ fact: 'The Sunstone was hidden in the Highspire smugglers\' den', category: 'detail', subjects: ['Sunstone'], visibility: 'secret' }],
      knowledgeGrants: [{ characterName: 'Kestrel', factText: 'The Sunstone was hidden in the Highspire smugglers\' den', learnedVia: 'witnessed' }]
    });

  for (let i = 0; i < 13; i++) {
    await playTurn(story, `I lie low and plan (night ${i + 1})`, 'The city sleeps uneasily.',
      { sceneUpdate: { situation: `Kestrel lies low, night ${i + 1}` } });
  }

  // ── Turn 39: return the Sunstone — resolve the quest ────────────────
  await playTurn(story, 'I return the Sunstone to Yola',
    'Yola\'s hands tremble as she seats the Sunstone back on the altar. "The temple remembers its friends."',
    {
      threadUpdates: [{ name: 'Find the Sunstone', status: 'resolved', resolution: 'Kestrel recovered the Sunstone and returned it to Yola' }],
      knowledgeGrants: [{ characterName: 'Yola', factText: 'The Sunstone was hidden in the Highspire smugglers\' den', factId: story.storyState.establishedFacts.find(f => f.fact.includes('smugglers'))?.id, learnedVia: 'told', learnedFrom: 'Kestrel' }],
      relationshipUpdates: [{ name: 'Yola', otherName: 'Kestrel', relationshipType: 'friend', description: 'grateful for the Sunstone\'s return' }],
      sceneUpdate: { locationName: 'Highspire Temple', situation: 'The Sunstone is restored; Yola owes Kestrel gratitude' }
    });
  assert.equal(story.storyThreads.find(t => t.name === 'Find the Sunstone').status, 'resolved');

  // ── Turn 40: DRIFT ATTACK #4 — reopening a resolved thread ──────────
  {
    const { report } = await playTurn(story, 'I ask Yola if she needs the stone found',
      'Yola frowns, puzzled. The stone sits on the altar.',
      { threadUpdates: [{ name: 'Find the Sunstone', status: 'active' }] });
    assert.ok(report.rejected.some(r => r.rule === 'thread-reopen'), 'resolved thread stays resolved');
  }

  // ── Turns 41-58: the long quiet — the promise thread goes fully dormant ──
  for (let i = 0; i < 18; i++) {
    await playTurn(story, `I enjoy Highspire (day ${i + 1})`, 'Days pass pleasantly.',
      { sceneUpdate: { situation: `Kestrel idles in Highspire, day ${i + 1}` } });
  }

  // ── Turn 59: dormant promise must still be in context, flagged ──────
  {
    const { prompt } = await playTurn(story, 'I wonder what I\'ve forgotten', 'A nagging feeling...', null);
    const promiseLine = prompt.split('\n').find(l => l.includes('Festival watch for Doran'));
    assert.ok(promiseLine, 'promise thread never disappeared from context');
    assert.ok(promiseLine.includes('DORMANT'), 'promise flagged dormant after ~50 turns');
  }

  // ── Canon query mid-campaign: answered from the record, with provenance,
  //    zero-turn — asking what you know must not advance the world. ────
  {
    const turnBefore = story.worldState.turnNumber;
    assert.equal(canonQueryService.isCanonQuery('What all do we know about the North Gate?'), true);
    assert.equal(canonQueryService.isCanonQuery('I ask Marta what she knows about the gate'), false, 'in-fiction action passes to GM');
    const payload = await canonQueryService.answerCanonQuery(story, 'What all do we know about the North Gate?');
    assert.equal(story.worldState.turnNumber, turnBefore, 'canon query is zero-turn');
    const gate = payload.facts.find(f => f.text.includes('destroyed by an ogre'));
    assert.ok(gate, 'gate fact retrieved from the record');
    assert.equal(gate.source, 'narrator', 'provenance preserved: narrator introduced it');
    assert.ok(!payload.facts.some(f => f.text.includes('stands intact')), 'the rejected contradiction never entered the record');
    const gateCard = payload.entities.find(e => e.name === 'North Gate');
    assert.equal(gateCard.state, 'destroyed', 'entity card carries canonical state');
    // The player's own secret carries player provenance in the record.
    const secretPayload = await canonQueryService.answerCanonQuery(story, "/recall the mayor's seal");
    const seal = secretPayload.facts.find(f => f.text.includes('seal'));
    assert.equal(seal?.source, 'player', 'player-asserted fact attributed to the player');
  }

  // ── Turn 60: back to Millhaven — old canon must hold ────────────────
  {
    const { prompt } = await playTurn(story, 'I travel back to Millhaven and approach the North Gate',
      'The road home is familiar. Ahead, the North Gate is still a scar of rubble; the town has cut a side path around it.',
      { sceneUpdate: { locationName: 'Millhaven', situation: 'Kestrel returns to Millhaven near the ruined North Gate' } });
    assert.ok(prompt.includes('destroyed by an ogre'), 'turn-2 fact surfaces on return, 58 turns later');
  }

  // ── Turn 61: NPCs remember; knowledge boundaries still hold ─────────
  {
    const { prompt } = await playTurn(story, 'I walk into the Gilded Goose and greet Marta and Doran',
      'Marta beams. Doran sets down his mug: "The festival is next week, rogue. I remember your promise."',
      { sceneUpdate: { locationName: 'The Gilded Goose', situation: 'Reunion at the Gilded Goose before the festival' } });
    const martaBlock = npcBlock(prompt, 'Marta');
    const doranBlock = npcBlock(prompt, 'Doran');
    assert.ok(martaBlock && doranBlock, 'both NPCs present');
    assert.ok(martaBlock.includes('seal'), 'Marta still knows the secret, 57 turns later');
    assert.ok(!doranBlock.includes('seal'), 'Doran STILL does not know the secret');
  }

  // ── Turn 62: valid knowledge flow — Marta tells Doran ───────────────
  {
    const { report } = await playTurn(story, 'I give Marta leave to tell Doran about the seal',
      'Marta pulls Doran aside and speaks low. His jaw tightens as he looks at Kestrel.',
      { knowledgeGrants: [{ characterName: 'Doran', factId: sealFact.id, learnedVia: 'told', learnedFrom: 'Marta' }] });
    assert.equal(report.rejected.filter(r => r.rule !== 'know-duplicate').length, 0);
    assert.ok(canonValidationService.findCharacter(story, 'Doran').knowledge.some(k => k.factId === sealFact.id), 'valid tell succeeded');
  }

  // ── Turn 63: resolve the promise ────────────────────────────────────
  await playTurn(story, 'I stand watch at the gate ruins through the festival',
    'Lanterns bob through Millhaven. Kestrel and Doran hold the gap where the gate once stood. Two cutpurses think better of it.',
    {
      threadUpdates: [{ name: 'Festival watch for Doran', status: 'resolved', resolution: 'Kestrel kept the promise and guarded the ruins during the festival' }],
      relationshipUpdates: [{ name: 'Doran', otherName: 'Kestrel', relationshipType: 'friend', description: 'Kestrel kept their word; Doran trusts them now' }]
    });
  assert.equal(story.storyThreads.find(t => t.name === 'Festival watch for Doran').status, 'resolved');

  // ── CHECKPOINT RESTORE — rewind to turn 20 ──────────────────────────
  const preRestoreTurn = story.worldState.turnNumber;
  assert.ok(preRestoreTurn >= 60, `campaign reached turn ${preRestoreTurn}`);

  const violations = checkpointService.restoreCheckpoint(story, story.checkpoints[0]);
  assert.equal(violations.length, 0, `restore is consistent: ${JSON.stringify(violations)}`);
  assert.equal(story.worldState.turnNumber, turnAtCheckpoint, 'turn counter rewound');
  assert.equal(story.storyState.establishedFacts.length, factCountAtCheckpoint, 'fact count rewound');
  // At turn 20: Garrick dead, secret known to Marta only, both threads active
  assert.equal(canonValidationService.findCharacter(story, 'Garrick').status, 'dead', 'Garrick dead at checkpoint (died turn 8)');
  const restoredSeal = story.storyState.establishedFacts.find(f => f.fact.includes('seal'));
  assert.ok(canonValidationService.findCharacter(story, 'Marta').knowledge.some(k => k.factId === restoredSeal.id));
  assert.ok(!canonValidationService.findCharacter(story, 'Doran').knowledge.some(k => k.factId === restoredSeal.id), 'restore rewound Doran\'s knowledge');
  assert.equal(story.storyThreads.find(t => t.name === 'Find the Sunstone').status, 'active', 'quest active again at turn 20');

  // ── Play on after restore — the timeline continues coherently ───────
  {
    const { prompt, turn } = await playTurn(story, 'I steel myself and head for the smugglers\' den',
      'The den\'s door looms in the dark.',
      { sceneUpdate: { situation: 'Kestrel approaches the smugglers\' den' } });
    assert.equal(turn, turnAtCheckpoint + 1, 'turn numbering continues from restored state');
    assert.ok(prompt.includes('Find the Sunstone'), 'quest thread live again in context');
  }

  // ── Run out the campaign to ~100 turns ──────────────────────────────
  while (story.worldState.turnNumber < 100) {
    const t = story.worldState.turnNumber;
    const { prompt } = await playTurn(story, `I continue my work in Highspire (${t})`,
      'The story rolls on.',
      t % 7 === 0 ? { newFacts: [{ fact: `On day ${t}, Kestrel noted the weather over Highspire`, category: 'detail', subjects: ['Highspire'] }] } : null);
    assert.ok(prompt.length < 30000, `context bounded at turn ${t}`);
  }

  // ── Final audit ─────────────────────────────────────────────────────
  assert.equal(story.worldState.turnNumber, 100, 'campaign reached 100 turns');
  const finalViolations = canonValidationService.auditStoryConsistency(story);
  assert.equal(finalViolations.length, 0, `no consistency violations after 100 turns: ${JSON.stringify(finalViolations)}`);

  // Canon still intact after everything:
  assert.equal(canonValidationService.findLocation(story, 'North Gate').state, 'destroyed');
  assert.equal(canonValidationService.findCharacter(story, 'Garrick').status, 'dead');
  const finalSeal = story.storyState.establishedFacts.find(f => f.fact.includes('seal'));
  assert.equal(finalSeal.visibility, 'secret');
  assert.ok(!canonValidationService.findCharacter(story, 'Fen').knowledge.some(k => k.factId === finalSeal.id), 'Fen never learned the secret');
});

test('checkpoint round-trip is lossless for canonical slices', async () => {
  const story = freshStory();
  await playTurn(story, 'I am Ash. I enter the ruined keep.',
    'Ash steps into the keep.',
    {
      playerCharacter: { name: 'Ash', description: 'a wanderer' },
      newLocations: [{ name: 'Ruined Keep', description: 'a shattered fortress', type: 'castle' }],
      newFacts: [{ fact: 'The Ruined Keep is haunted by its last garrison', category: 'location', subjects: ['Ruined Keep'] }],
      sceneUpdate: { locationName: 'Ruined Keep', situation: 'Ash explores the keep' }
    });

  const cp = checkpointService.makeCheckpoint(story, 'test');
  const before = JSON.stringify({
    facts: story.storyState.establishedFacts,
    threads: story.storyThreads,
    chars: story.characters,
    locs: story.locations,
    world: story.worldState
  });

  // Mutate everything, then restore.
  await playTurn(story, 'I burn it all down', 'Flames rise.',
    {
      locationUpdates: [{ name: 'Ruined Keep', state: 'destroyed', stateNotes: 'burned by Ash' }],
      newFacts: [{ fact: 'Ash burned the Ruined Keep', category: 'event', subjects: ['Ruined Keep', 'Ash'] }]
    });
  assert.equal(story.locations[0].state, 'destroyed');

  const violations = checkpointService.restoreCheckpoint(story, cp);
  assert.equal(violations.length, 0);
  const after = JSON.stringify({
    facts: story.storyState.establishedFacts,
    threads: story.storyThreads,
    chars: story.characters,
    locs: story.locations,
    world: story.worldState
  });
  assert.equal(after, before, 'canonical slices identical after round-trip');
});
