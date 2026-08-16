/**
 * checkpointService — full-state checkpoint snapshot/restore.
 *
 * A checkpoint is actual game state, not a text bookmark: restoring one
 * returns the campaign to a consistent point including threads, facts,
 * character knowledge, summaries, and dice history.
 *
 * JSON round-trip detaches snapshots from mongoose documents; schema
 * casting restores types on assignment. Works identically on plain objects
 * (used by the offline campaign harness).
 */
import canonValidationService from './canonValidationService.js';

const snap = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

class CheckpointService {
  makeCheckpoint(story, description = 'Checkpoint') {
    return {
      id: Date.now().toString(),
      timestamp: new Date(),
      description,
      turnNumber: story.worldState?.turnNumber || 0,
      events: snap(story.events),
      worldState: snap(story.worldState),
      characters: snap(story.characters),
      locations: snap(story.locations),
      storyThreads: snap(story.storyThreads || []),
      storyState: snap(story.storyState || {}),
      storySummaries: snap(story.storySummaries || []),
      diceResults: snap(story.diceResults || []),
      stats: snap(story.stats)
    };
  }

  /**
   * Restore a checkpoint onto a story. Mutates the story; does not save.
   * Returns consistency violations found post-restore (empty = clean).
   */
  restoreCheckpoint(story, checkpoint) {
    story.events = snap(checkpoint.events);
    story.worldState = snap(checkpoint.worldState);
    story.characters = snap(checkpoint.characters);
    story.locations = snap(checkpoint.locations);
    // Older checkpoints (pre-continuity) may lack these — restore only what
    // the snapshot actually captured.
    if (checkpoint.storyThreads) story.storyThreads = snap(checkpoint.storyThreads);
    if (checkpoint.storyState) story.storyState = snap(checkpoint.storyState);
    if (checkpoint.storySummaries) story.storySummaries = snap(checkpoint.storySummaries);
    if (checkpoint.diceResults) story.diceResults = snap(checkpoint.diceResults);
    if (checkpoint.stats) story.stats = { ...snap(checkpoint.stats), lastActive: new Date() };
    else if (story.stats) story.stats.lastActive = new Date();

    return canonValidationService.auditStoryConsistency(story);
  }

  findCheckpoint(story, idOrDescription) {
    const checkpoints = story.checkpoints || [];
    if (!idOrDescription) return checkpoints[checkpoints.length - 1] || null;
    return checkpoints.find(cp =>
      cp.id === idOrDescription ||
      cp.description.toLowerCase().includes(idOrDescription.toLowerCase())
    ) || null;
  }
}

export default new CheckpointService();
