/**
 * A secondary connection that can't reach Mongo at boot must stop the process
 * (Docker restarts it), not leave queries buffering forever. lib/requireConnection.js.
 */

import { describe, it, expect, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { requireConnection } from '../lib/requireConnection.js';

const quietLogger = () => ({ info: jest.fn(), error: jest.fn() });

describe('requireConnection', () => {
  it('exits 1 when the initial connect fails', async () => {
    // Nothing listens on port 1: the same failure as Mongo not accepting yet.
    const conn = mongoose.createConnection('mongodb://127.0.0.1:1/userGeek', { serverSelectionTimeoutMS: 300 });
    conn.on('error', () => {});
    const exit = jest.fn();
    const logger = quietLogger();

    await requireConnection(conn, 'userGeek', { logger, exit });

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalled();
    await conn.close();
  });

  it('does not exit once the connection opens', async () => {
    const conn = { asPromise: () => Promise.resolve() };
    const exit = jest.fn();
    const logger = quietLogger();

    await requireConnection(conn, 'userGeek', { logger, exit });

    expect(exit).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('userGeek database connected');
  });
});
