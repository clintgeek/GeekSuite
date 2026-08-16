/**
 * projections.js — pure read-only derivations of the game-facing view from a
 * Story document. These mirror the backend's canonical model (contextService
 * / canonValidationService) so the UI shows exactly what the engine believes,
 * never a parallel truth. Nothing here mutates; everything is derived per render.
 */

const norm = (s) => (s || '').trim().toLowerCase();

const DORMANT_TURNS = 12;

/** The player character (there is exactly one, flagged isPlayer). */
export function getPlayer(story) {
  return (story?.characters || []).find((c) => c.isPlayer) || null;
}

/** Current location object (from worldState.currentLocationName), or null. */
export function getCurrentLocation(story) {
  const name = story?.worldState?.currentLocationName;
  if (!name) return null;
  return (story.locations || []).find((l) => norm(l.name) === norm(name)) || null;
}

/**
 * NPCs present in the current scene — mirrors contextService.getPresentCharacters:
 * living NPCs co-located with the player, with a recency fallback when the
 * story hasn't established locations yet.
 */
export function getPresentNpcs(story) {
  const chars = (story?.characters || []).filter((c) => !c.isPlayer && c.isActive !== false);
  const loc = getCurrentLocation(story);
  const living = chars.filter((c) => c.status !== 'dead');

  if (loc) {
    const here = living.filter((c) => norm(c.locationName) === norm(loc.name));
    if (here.length > 0) return here.slice(0, 8);
  }
  // Fallback: most recently seen living NPCs (early story, no location yet).
  return [...living]
    .sort((a, b) => (b.lastSeenTurn || 0) - (a.lastSeenTurn || 0))
    .slice(0, 4);
}

/** Active story threads, newest-activity first, with a dormancy flag. */
export function getActiveThreads(story) {
  const turn = story?.worldState?.turnNumber || 0;
  return (story?.storyThreads || [])
    .filter((t) => t.status === 'active')
    .map((t) => ({
      ...t,
      dormant: turn - (t.updatedTurn || t.openedTurn || 0) >= DORMANT_TURNS,
      age: turn - (t.updatedTurn || t.openedTurn || 0),
    }))
    .sort((a, b) => (b.updatedTurn || 0) - (a.updatedTurn || 0));
}

/** Resolved/abandoned threads (for the journal's "settled" section). */
export function getClosedThreads(story) {
  return (story?.storyThreads || []).filter((t) => t.status !== 'active');
}

/** Live (non-retired) established facts. */
export function getLiveFacts(story) {
  return (story?.storyState?.establishedFacts || []).filter((f) => !f.isRetired);
}

/**
 * The player character's relationship line toward an NPC, if the NPC records one.
 * Relationships live on the character who holds the opinion; we look at the
 * NPC's view of the player (that's what colours how they treat you).
 */
export function npcRelationshipToPlayer(npc, player) {
  if (!player) return null;
  return (npc.relationships || []).find((r) => norm(r.characterName) === norm(player.name)) || null;
}

/**
 * A bounded summary of what an NPC knows: the count and the fact texts they
 * actually hold. The UI renders this as the "Knows" line — never more than
 * the engine has granted them, so the interface can't leak omniscience.
 */
export function npcKnownFacts(npc, story) {
  const byId = new Map(getLiveFacts(story).map((f) => [f.id, f]));
  return (npc.knowledge || [])
    .map((k) => byId.get(k.factId))
    .filter(Boolean);
}

/**
 * The Journal: what the PLAYER character reasonably knows — public canon plus
 * any secrets they personally hold — grouped for reading. This is the
 * persistence problem made legible: the game remembers so the player doesn't
 * have to.
 */
export function buildJournal(story) {
  const player = getPlayer(story);
  const playerFactIds = new Set((player?.knowledge || []).map((k) => k.factId));
  const facts = getLiveFacts(story);

  const known = facts.filter(
    (f) => f.visibility !== 'secret' || playerFactIds.has(f.id) ||
      (f.subjects || []).some((s) => norm(s) === norm(player?.name))
  );

  const bucket = { people: [], places: [], events: [], details: [] };
  for (const f of known) {
    const entry = { text: f.fact, turn: f.turn, secret: f.visibility === 'secret', source: f.source || null };
    if (f.category === 'character') bucket.people.push(entry);
    else if (f.category === 'location') bucket.places.push(entry);
    else if (f.category === 'event') bucket.events.push(entry);
    else bucket.details.push(entry);
  }
  // Most recent first within each bucket.
  for (const k of Object.keys(bucket)) bucket[k].sort((a, b) => (b.turn || 0) - (a.turn || 0));
  return bucket;
}

/** Scene descriptor for the scene panel. */
export function getScene(story) {
  const loc = getCurrentLocation(story);
  const ws = story?.worldState || {};
  return {
    locationName: ws.currentLocationName || (loc?.name) || '',
    location: loc,
    state: loc?.state || 'intact',
    type: loc?.type || 'other',
    atmosphere: loc?.atmosphere || '',
    description: loc?.description || '',
    situation: ws.currentSituation || '',
    mood: ws.mood || 'neutral',
    weather: ws.weather || 'clear',
    timeOfDay: ws.timeOfDay || 'day',
    turn: ws.turnNumber || 0,
    storyDay: Math.floor((ws.hoursElapsed || 0) / 24) + 1,
  };
}
