#!/usr/bin/env node
/**
 * Live long-campaign playtest — drives a REAL StoryGeek backend with real
 * aiGeek inference, plays a scripted drift-hunting campaign, then runs an
 * AI evaluator over the transcript + canonical state to flag contradictions.
 *
 * The evaluator's findings are LEADS, not verdicts — canonical state is
 * checked deterministically; prose findings are printed for human review.
 *
 * Usage (requires a running backend + valid credentials):
 *   STORYGEEK_URL=http://localhost:8014 \
 *   STORYGEEK_TEST_TOKEN=<jwt> \
 *   node scripts/liveCampaign.js [--turns 60]
 *
 * This script is deliberately NOT part of `npm test` — it costs real AI
 * calls and needs live services.
 */
import axios from 'axios';

const BASE = process.env.STORYGEEK_URL || 'http://localhost:8014';
const TOKEN = process.env.STORYGEEK_TEST_TOKEN;
const TURNS = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--turns') || '60', 10);

if (!TOKEN) {
  console.error('STORYGEEK_TEST_TOKEN is required (a valid user JWT for the backend).');
  process.exit(1);
}

const api = axios.create({
  baseURL: `${BASE}/api`,
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  timeout: 120000
});

// A scripted campaign that revisits its own past on purpose.
const SCRIPT = [
  // establish
  'I am Brena, a smith\'s daughter turned sellsword. I arrive in the river town of Duskbridge.',
  'I take a room at the Lantern & Eel inn and ask the innkeeper about work.',
  'I inspect the old stone bridge the town is named for.',
  'I try to topple the cracked statue on the bridge into the river.', // destructive fact
  'I tell ONLY the innkeeper, in private, that I am hunting the man who burned my father\'s forge.',
  'I promise the dockmaster I will guard tonight\'s grain shipment in exchange for silver.',
  'I guard the shipment through the night.',
  'I explore the market district in the morning.',
  'I pick a fight with a drunk mercenary who insulted me.',
  'I ask around about a man with a burn-scarred hand.',
  // travel + expand
  'I take the road north toward the city of Coldharbor.',
  'I make camp and keep watch.',
  'I arrive in Coldharbor and find lodging.',
  'I visit the harbor temple and speak with the priest.',
  'I ask the priest about mercenary companies that passed through recently.',
  // checkpoint
  '/checkpoint before the warehouse job',
  'I sneak into the warehouse by the docks at midnight.',
  'I search the warehouse office for ledgers.',
  'I escape over the rooftops.',
  'I study the ledger I stole.',
];

// Turns that deliberately revisit the past. %-based fillers pad to --turns.
const REVISIT = [
  'I travel back to Duskbridge.',
  'I return to the Lantern & Eel and greet the innkeeper by name.',
  'I walk onto the old stone bridge and look at where the statue stood.',
  'I visit the dockmaster and remind him of the night I guarded his grain.',
  'I ask the innkeeper whether anyone else knows why I am really here.',
  '/back before the warehouse job',
  'I steel myself and head for the warehouse again.',
  'I check my pack and count my coin.',
];

const FILLERS = [
  'I order food and listen to the room\'s gossip.',
  'I sharpen my blade and think about my next move.',
  'I take a walk and observe the streets.',
  'I chat with a stranger at the bar.',
  'I train in the yard for an hour.',
  'I attempt to haggle for supplies at a market stall.'
];

async function main() {
  console.log(`Live campaign against ${BASE}, target ${TURNS} turns\n`);

  // 1. Start a story
  const start = await api.post('/stories/start', {
    prompt: 'A grounded low-fantasy revenge tale in the river towns of the north. Gritty but human scale.',
    title: `Drift Hunt ${new Date().toISOString().slice(0, 16)}`,
    genre: 'Fantasy'
  });
  const storyId = start.data.storyId;
  console.log(`Story ${storyId} created. Setup questions received.\n`);

  // 2. Answer setup
  await turn(storyId, 'Brena is stubborn, loyal, and quick with her fists. Start at the gates of Duskbridge at dusk. Keep stakes personal — this is about one woman\'s revenge, not the fate of kingdoms.');

  // 3. Play the script
  const inputs = [...SCRIPT];
  while (inputs.length < TURNS - REVISIT.length) {
    inputs.push(FILLERS[inputs.length % FILLERS.length]);
  }
  inputs.push(...REVISIT);

  const transcript = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    process.stdout.write(`[${i + 2}/${inputs.length + 1}] ${input.slice(0, 60)}... `);
    try {
      const data = await turn(storyId, input);
      transcript.push({ turn: i + 2, input, response: data.aiResponse || data.message || '', dice: data.diceResult || null });
      console.log(data.diceResult ? `(d20=${data.diceResult.result})` : 'ok');
    } catch (e) {
      console.log(`FAILED: ${e.response?.data?.error || e.message}`);
      transcript.push({ turn: i + 2, input, error: e.message });
    }
    await sleep(1500); // stay polite to free-tier rate limits
  }

  // 4. Pull final canonical state
  const { data: story } = await api.get(`/stories/${storyId}`);
  console.log('\n=== CANONICAL STATE AFTER CAMPAIGN ===');
  console.log(`Turn counter: ${story.worldState?.turnNumber}`);
  console.log(`Characters: ${(story.characters || []).map(c => `${c.name}[${c.status}]`).join(', ')}`);
  console.log(`Locations: ${(story.locations || []).map(l => `${l.name}[${l.state}]`).join(', ')}`);
  console.log(`Threads: ${(story.storyThreads || []).map(t => `${t.name}[${t.status}]`).join(', ')}`);
  console.log(`Facts: ${(story.storyState?.establishedFacts || []).filter(f => !f.isRetired).length} live`);

  // 5. Evaluator pass — AI reads transcript + canon and hunts contradictions.
  console.log('\n=== EVALUATOR PASS ===');
  const facts = (story.storyState?.establishedFacts || []).filter(f => !f.isRetired)
    .map(f => `- [turn ${f.turn}] ${f.fact}`).join('\n');
  const lateTranscript = transcript.slice(-30)
    .map(t => `T${t.turn} PLAYER: ${t.input}\nT${t.turn} GM: ${(t.response || t.error || '').slice(0, 500)}`).join('\n\n');

  const evalPrompt = `You are a continuity auditor for a long-running RPG campaign. Below are the campaign's CANONICAL FACTS (ground truth) and the LATE-CAMPAIGN TRANSCRIPT (the last ~30 turns).

List every place where the GM's narration CONTRADICTS a canonical fact, has an NPC use knowledge they plausibly should not have, or forgets an established consequence. For each finding give: the turn number, the quoted phrase, and the fact it contradicts. If you find none, say "NO CONTRADICTIONS FOUND".

CANONICAL FACTS:
${facts}

TRANSCRIPT:
${lateTranscript}`;

  try {
    const BASEGEEK = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';
    const { data: evalResp } = await axios.post(`${BASEGEEK}/api/ai/call`, {
      prompt: evalPrompt,
      config: { appName: 'storyGeek', maxTokens: 1500, temperature: 0.1 }
    }, { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 90000 });
    const content = evalResp?.choices?.[0]?.message?.content || evalResp?.data?.response || '(no content)';
    console.log(content);
  } catch (e) {
    console.log(`Evaluator call failed: ${e.message}`);
  }

  console.log(`\nDone. Story id: ${storyId} (review in the UI; delete when finished).`);
}

async function turn(storyId, userInput) {
  const { data } = await api.post(`/stories/${storyId}/continue`, { userInput });
  return data;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

main().catch(e => {
  console.error('Live campaign failed:', e.response?.data || e.message);
  process.exit(1);
});
