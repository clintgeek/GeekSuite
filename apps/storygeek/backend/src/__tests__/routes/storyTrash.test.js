// Recently deleted, over HTTP (SUITE_REVIEW_2026-11 decision S-D5,
// 2026-11-16): delete moves a story to the trash for 30 days, the trash is
// listed (after a lazy purge of what has expired), and Restore / Delete
// forever only ever reach the caller's own trashed stories.
//
// Same hermetic technique as stories.test.js. The filter semantics
// themselves (owner, in-trash, 30 days) are exercised in ../turnLock.test.js.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';
const mod = (p) => new URL(p, import.meta.url).pathname;
const DAY = 24 * 60 * 60 * 1000;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ error: 'User authentication required' });
    req.user = { _id: userId, id: userId, userId };
    next();
  },
}));

const mockStory = {
  findById: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
  deleteMany: jest.fn(),
  exists: jest.fn(),
};
jest.unstable_mockModule(mod('../../models/Story.js'), () => ({ default: mockStory }));

const { default: storyRoutes } = await import('../../routes/stories.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stories', storyRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStory.deleteMany.mockResolvedValue({ deletedCount: 0 });
});

describe('GET /api/stories/deleted', () => {
  function trashRows(rows) {
    const lean = jest.fn().mockResolvedValue(rows);
    const sort = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ sort });
    mockStory.find.mockReturnValue({ select });
    return { select, sort };
  }

  test("lists only the caller's trash, newest first, with when each will be purged", async () => {
    const deletedAt = new Date('2026-11-10T00:00:00Z');
    const { sort } = trashRows([{ _id: 's1', title: 'The Cursed Forest', deletedAt }]);

    const res = await request(buildApp()).get('/api/stories/deleted').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(mockStory.find).toHaveBeenCalledWith({ userId: OWNER, deletedAt: { $ne: null } });
    expect(sort).toHaveBeenCalledWith({ deletedAt: -1 });
    expect(res.body.retentionDays).toBe(30);
    expect(res.body.stories[0].title).toBe('The Cursed Forest');
    expect(new Date(res.body.stories[0].purgeAt).getTime()).toBe(deletedAt.getTime() + 30 * DAY);
  });

  test('opening the trash runs the lazy purge first', async () => {
    trashRows([]);
    await request(buildApp()).get('/api/stories/deleted').set('x-test-user', OWNER);
    expect(mockStory.deleteMany).toHaveBeenCalledWith({ deletedAt: { $ne: null, $lt: expect.any(Date) } });
    const cutoff = mockStory.deleteMany.mock.calls[0][0].deletedAt.$lt.getTime();
    expect(Math.abs(Date.now() - 30 * DAY - cutoff)).toBeLessThan(5000);
  });

  test('is not mistaken for a story id', async () => {
    trashRows([]);
    await request(buildApp()).get('/api/stories/deleted').set('x-test-user', OWNER);
    expect(mockStory.findById).not.toHaveBeenCalled();
  });

  test('needs a session', async () => {
    expect((await request(buildApp()).get('/api/stories/deleted')).status).toBe(401);
  });
});

describe('POST /api/stories/:storyId/restore', () => {
  test("restores the caller's own trashed story and clears any stale lock", async () => {
    mockStory.updateOne.mockResolvedValue({ matchedCount: 1 });
    const res = await request(buildApp()).post('/api/stories/s1/restore').set('x-test-user', OWNER);
    expect(res.status).toBe(200);
    expect(mockStory.updateOne).toHaveBeenCalledWith(
      { _id: 's1', userId: OWNER, deletedAt: { $ne: null } },
      { $set: { deletedAt: null }, $unset: { turnLock: '' } }
    );
  });

  test("404 for a story that is not in the caller's trash (someone else's, or not deleted)", async () => {
    mockStory.updateOne.mockResolvedValue({ matchedCount: 0 });
    const res = await request(buildApp()).post('/api/stories/s1/restore').set('x-test-user', OWNER);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/stories/:storyId/forever', () => {
  test('removes only a story already in the trash, and only the caller’s', async () => {
    mockStory.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const res = await request(buildApp()).delete('/api/stories/s1/forever').set('x-test-user', OWNER);
    expect(res.status).toBe(200);
    expect(mockStory.deleteOne).toHaveBeenCalledWith({ _id: 's1', userId: OWNER, deletedAt: { $ne: null } });
  });

  test('a story that is not in the trash is a 404 and stays', async () => {
    mockStory.deleteOne.mockResolvedValue({ deletedCount: 0 });
    const res = await request(buildApp()).delete('/api/stories/s1/forever').set('x-test-user', OWNER);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/stories/:storyId', () => {
  test('a story that vanished between the read and the move is a 404, not a false "deleted"', async () => {
    mockStory.findById.mockResolvedValue({ _id: 's1', userId: OWNER });
    mockStory.updateOne.mockResolvedValue({ matchedCount: 0 });
    mockStory.exists.mockResolvedValue(null);
    const res = await request(buildApp()).delete('/api/stories/s1').set('x-test-user', OWNER);
    expect(res.status).toBe(404);
  });
});
