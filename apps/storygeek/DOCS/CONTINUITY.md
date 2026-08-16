# StoryGeek Continuity Architecture

*Written August 2026 — the code is the source of truth; this explains the shape.*

## The problem this solves

StoryGeek worked, but long campaigns drifted: facts got contradicted, NPCs
became omniscient or generic, unresolved threads evaporated, destroyed
locations healed themselves, and stakes inflated. Root cause analysis found
the model was playing with amnesia — the controller built a rich context and
then **discarded it**, sending the model only the last 3 events with
`currentSituation` hardcoded to `"Story continues..."` every turn. The
fact/thread schemas existed but nothing ever wrote to or read from them.

## The architecture

```
AUTHORITATIVE GAME STATE  (Story document: facts, threads, characters+knowledge, locations+state)
        ↓
CONTEXT BUILDER           (contextService.buildTurnContext — deliberate, budgeted package)
        ↓
AI GAME MASTER            (pinned model via aiGeek; ROLL protocol for engine dice)
        ↓
STATE EXTRACTION          (stateExtractionService — cheap aux model → proposed changes JSON)
        ↓
VALIDATION                (canonValidationService — deterministic invariants)
        ↓
COMMIT                    (stateCommitService — the only AI→canon write path)
```

The application owns truth. The model narrates.

### Canonical state (models/Story.js)

- **Established facts** — `storyState.establishedFacts[]`: stable `id`,
  `subjects` (entity names for relevance selection), `visibility`
  (public/secret), `turn`. Facts are never deleted; superseded facts are
  *retired* with a reason, preserving the audit trail.
- **Characters** — `status` (dead stays dead), `motivation`, `locationName`,
  and **`knowledge[]`**: the facts each character knows and *how they learned
  them* (witnessed / told / inference / initial). `isPlayer` marks the PC.
- **Locations** — `state` (intact/damaged/destroyed/altered) + `stateNotes`.
  Destroyed stays destroyed.
- **Threads** — typed open loops (quest/promise/debt/secret/hunt/consequence)
  with `openedTurn`/`updatedTurn`. Resolved stays resolved.
- **worldState.turnNumber** — the monotonic timeline spine.

### Context package (per turn)

Sections in priority order (lowest-value trimmed first under a ~24k-char
budget — the answer to long stories is better *selection*, not bigger dumps):

1. GM system rules (agency, canon, knowledge boundaries, scale, dice protocol)
2. Story header, current scene (location + canonical state), player sheet
3. **Present characters** — co-located + mentioned NPCs, each with
   personality, motivation, relationship to player, and their **KNOWS list**
   (rendered from knowledge links). The model is instructed the list is
   exhaustive: an NPC must never act on information not in it.
4. Active threads — always *all* of them (few and precious); threads
   untouched for 12+ turns are flagged `DORMANT — consider resurfacing`.
5. Canon alerts — contradictions caught last turn, rendered as gentle
   course-corrections.
6. Relevant established facts — scored by subject overlap with the scene and
   the player's input; capped.
7. Recent events (last 6, clipped), latest summaries, dice result, player action.

### Validation invariants (deterministic — the engine knows, not the model)

- Dead characters stay dead (no move, no learn, no status change) unless the
  change is an explicit `isRevival`.
- Destroyed locations stay destroyed unless explicit `isRebuild`.
- Resolved/abandoned threads never reopen — follow-ups are new threads.
- Knowledge only flows through valid vectors: `witnessed` requires presence
  **and the fact being born that turn** (seeing aftermath later is
  `inference`); `told` requires a teller who actually knows the fact.
- New facts that contradict live facts (subject overlap + oppositional
  keywords) do **not** enter canon — they surface as next-turn CANON ALERTS.
- `auditStoryConsistency()` sweeps for dangling references (used after
  checkpoint restore and by tests).

### Dice

Unchanged and deterministic: `diceService` rolls, never the model. The model
requests at most one roll per turn via the `ROLL: d20 | situation=… | reason=…`
protocol; the engine rolls; a second GM call narrates the outcome **with the
pre-roll draft included** so narrative intent survives the round-trip.

### Checkpoints (checkpointService)

Full state snapshots: events, worldState, characters (incl. knowledge),
locations, threads, facts, summaries, dice history, stats. Restore rewinds
all of it and runs the consistency audit. Pre-continuity checkpoints (missing
the new fields) restore what they captured.

### Model pinning (aiService)

- GM: `STORYGEEK_GM_PROVIDER`/`STORYGEEK_GM_MODEL` (default
  `gemini`/`gemini-2.0-flash` — the stable id of the flash family that was
  already the empirical choice; the old default `gemini-1.5-flash-latest` is
  retired upstream).
- Free-only mode no longer means "first free model in an unordered list":
  explicit user choice → pinned model → `STORYGEEK_GM_FALLBACKS` →
  newest free gemini flash, all verified against the director's free list.
- Extraction/summaries use the aux channel (`STORYGEEK_AUX_*`), low
  temperature.
- `GET /api/ai/gm-config` exposes the pin; the frontend Settings picker
  defaults to it.

## Testing

- `npm test` — 36 offline tests, no DB, no network, no AI:
  - `canonValidation.test.js` — every invariant, including same-turn chains.
  - `contextBuilder.test.js` — knowledge boundaries in the rendered prompt,
    presence selection, dormant flagging, canon alerts, token budget.
  - `campaign.test.js` — **a scripted 100-turn campaign** through the real
    pipeline with deliberate drift attacks: a resurrection attempt, a
    gate-repair contradiction, an NPC knowledge leak, a thread reopen — all
    must bounce; a secret told to one NPC at turn 4 verified unleaked at turn
    61; checkpoint at turn 20 restored at turn ~63 and play continued.
- `scripts/liveCampaign.js` — env-gated live playtest against a running
  backend with real inference; plays a drift-hunting script, dumps canonical
  state, then runs an AI evaluator over transcript+canon as a lead-generator
  (canon stays authoritative). Not part of `npm test`; costs real calls.

## What deliberately did NOT change

Dice mechanics, slash commands (`/checkpoint /back /char /info /end`), the
setup flow, the frontend chat UI, the master prompt's player-agency and
no-moralizing rules (strengthened, not weakened), baseGeek/aiGeek as the only
inference path, and the free-tier-first cost posture.
