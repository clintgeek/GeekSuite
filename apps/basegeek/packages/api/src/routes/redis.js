import express from 'express';
import { createClient } from 'redis';
import { requireAdmin } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = express.Router();

// Admin only — the whole router. `/status` returns the full Redis `INFO`
// dump (`statsRaw`) for the shared instance — the same infrastructure
// inventory as routes/mongo.js, which carries the full note.
// See DOCS/AUTH_SYSTEM.md (Roles).
router.use(requireAdmin);

const REDIS_URL = process.env.REDIS_URL || 'redis://192.168.1.17:6380';

router.get('/status', async (req, res) => {
  // Two things this handler used to get wrong when Redis was down:
  //
  //   1. No `.on('error')`. node-redis clients are EventEmitters, and an
  //      'error' event with no listener is *thrown* by Node — an unreachable
  //      Redis crashed the whole API process instead of returning a 500.
  //   2. `await client.quit()` sat inside the catch block, so a rejecting
  //      quit() escaped as an unhandled rejection and the response was never
  //      sent (the request hung until the client gave up). Closing in a
  //      `finally`, with the rejection swallowed, keeps the 500 path honest.
  const client = createClient({ url: REDIS_URL, socket: { reconnectStrategy: false } });
  client.on('error', (err) => logger.debug({ err }, '[redis/status] client error'));
  try {
    await client.connect();
    const info = await client.info();
    // Parse Redis INFO response
    const lines = info.split('\n');
    const stats = {};
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) stats[key.trim()] = value.trim();
      }
    }
    res.json({
      status: 'connected',
      redisVersion: stats.redis_version,
      uptime: stats.uptime_in_seconds,
      connectedClients: stats.connected_clients,
      usedMemory: stats.used_memory_human || stats.used_memory,
      totalKeys: stats.db0 ? stats.db0.split(',')[0].split('=')[1] : 0,
      statsRaw: stats
    });
  } catch (error) {
    req.log.error({ err: error }, 'Redis status error');
    res.status(500).json({ status: 'error', message: error.message });
  } finally {
    if (client.isOpen) await client.quit().catch(() => {});
  }
});

export default router;