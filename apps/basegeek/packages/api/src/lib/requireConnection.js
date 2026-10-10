/**
 * Boot gate for a mongoose connection made with createConnection().
 *
 * mongoose never retries a failed *initial* connect. After a power cut every
 * container starts in the same second, so basegeek can dial Mongo before it
 * accepts connections; the userGeek connection then stayed dead and every
 * login buffered `users.findOne()` until it timed out (2026-10-10, an hour
 * down while /api/health said "unhealthy"). Docker doesn't restart an
 * unhealthy container, but it does restart one that exits — so exit, the same
 * way server.js treats the main connection.
 */
export async function requireConnection(conn, name, { logger, exit = (code) => process.exit(code) }) {
  try {
    await conn.asPromise();
    logger.info(`${name} database connected`);
  } catch (err) {
    logger.error({ err }, `${name} database connection error`);
    exit(1);
  }
}

export default requireConnection;
