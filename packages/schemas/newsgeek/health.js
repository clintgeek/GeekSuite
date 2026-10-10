/**
 * newsgeek feed health — ONE definition, read by the gateway (the Sources
 * screen) and the backend worker. DOCS/NEWSGEEK_PLAN.md "Gateway API, N0".
 *
 * Order matters: never → broken → failing → stale → ok.
 */
const { BROKEN_AFTER_FAILURES } = require('./constants.js');

function feedHealth(feed, sourceStatus) {
  if (!feed || !feed.lastFetchAt) return 'never';
  const failures = feed.consecutiveFailures || 0;
  if (sourceStatus === 'broken' || failures >= BROKEN_AFTER_FAILURES) return 'broken';
  if (failures > 0) return 'failing';
  if (feed.stale) return 'stale';
  return 'ok';
}

module.exports = { feedHealth };
